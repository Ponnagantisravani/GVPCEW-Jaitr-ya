import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';
const root=fileURLToPath(new URL('../../',import.meta.url));
const url=new URL(process.env.ATTENDANCE_TEST_DATABASE_URL);
assert(['postgres:','postgresql:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname==='/attendance_load_test','Dedicated local test database required.');
process.env.DATABASE_URL=url.href;process.env.DATABASE_SSL_MODE='disable';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='development';process.env.LOCAL_ATTENDANCE_DEMO='true';process.env.LOCAL_FACE_SERVICE_KEY='test-only-local-face-key';
const admin=new pg.Pool({connectionString:url.href,ssl:false,max:3});let pool,server;const report={mode:'local-browser-demo-real-postgresql',face_service:'synthetic verdicts only for SQL/HTTP integration; real model checks run separately',passed:false,checks:[]};
const originalFetch=globalThis.fetch;let rejectFace=false,rejectBlink=false,onVerify;
globalThis.fetch=async(url,options)=>{if(String(url)==='http://127.0.0.1:5002/enroll')return Response.json({embedding:Array.from({length:128},()=>1/Math.sqrt(128)),model:'opencv-sface-demo-v1',faceCount:1});if(String(url)==='http://127.0.0.1:5002/verify'){if(onVerify)await onVerify();if(rejectFace||rejectBlink)return Response.json({message:rejectFace?'Face does not match':'Blink was not detected'},{status:422});return Response.json({identityVerified:true,blinkObserved:true,similarity:1,model:'opencv-sface-demo-v1'});}return originalFetch(url,options);};
try {
 assert.equal((await admin.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0,'Refusing nonempty database.');
 for(const file of ['schema.sql','production.sql','syllabus.sql','academic-access.sql','bluetooth-attendance.sql','mobile-attendance.sql','mobile-attendance-fcm.sql','mobile-attendance-ble.sql','mobile-attendance-lifecycle.sql','local-attendance-demo.sql'])await admin.query(await readFile(path.join(root,'database',file),'utf8'));
 ({pool}=await import('../src/config/db.js'));const {localAttendanceDemoRouter}=await import('../src/routes/localAttendanceDemo.js');
 const app=express();app.use(express.json());app.use('/demo',localAttendanceDemoRouter);app.use((e,_req,res,_next)=>res.status(e.status||500).json({message:e.message}));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/demo';
 const id=()=>crypto.randomUUID(),department=id(),section=id(),otherSection=id();
 await admin.query('insert into departments(id,name) values($1,$2)',[department,'Demo test department']);
 for(const [s,name] of [[section,'A'],[otherSection,'B']])await admin.query('insert into academic_sections(id,department_id,year_number,semester_number,section_name,academic_year) values($1,$2,3,5,$3,$4)',[s,department,name,'2026-2027']);
 const members=[];
 for(let i=0;i<3;i++){const m={id:id(),student:id(),section:i===2?otherSection:section};await admin.query('insert into users(id,full_name,email,password_hash,role) values($1,$2,$3,$4,$5)',[m.id,'Demo '+i,m.id+'@test.invalid','not-a-login-hash','student']);await admin.query("insert into user_roles values($1,'student')",[m.id]);if(i===0){await admin.query("insert into user_roles values($1,'student_coordinator')",[m.id]);await admin.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2)',[m.id,section]);}await admin.query('insert into students(id,user_id,department_id,roll_number,academic_section_id) values($1,$2,$3,$4,$5)',[m.student,m.id,department,'DEMO-'+i,m.section]);m.token=jwt.sign({sub:m.id},process.env.JWT_SECRET,{expiresIn:'1h'});members.push(m);}
 async function request(member,endpoint,body){const res=await fetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(member?{Authorization:'Bearer '+member.token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:res.status,data:await res.json()};}
 const [coordinator,student,outsider]=members;
 const frames=Array.from({length:16},()=> 'data:image/jpeg;base64,AAAA');
 async function cameraPayload(member,sessionId){const c=await request(member,'/challenge',{session_id:sessionId});assert.equal(c.status,201,JSON.stringify(c.data));return {session_id:sessionId,challenge_id:c.data.challenge_id,frames};}

 process.env.NODE_ENV='production';assert.equal((await request(coordinator,'/configuration')).status,404);process.env.NODE_ENV='development';process.env.LOCAL_ATTENDANCE_DEMO='false';assert.equal((await request(coordinator,'/configuration')).status,404);process.env.LOCAL_ATTENDANCE_DEMO='true';assert.equal((await request(null,'/configuration')).status,401);report.checks.push('disabled by default; unavailable in production; authentication required');
 assert.equal((await request(student,'/start',{section_id:section})).status,403);assert.equal((await request(coordinator,'/start',{section_id:otherSection})).status,403);
 const starts=await Promise.all([request(coordinator,'/start',{section_id:section}),request(coordinator,'/start',{section_id:section})]);assert.deepEqual(starts.map(r=>r.status).sort(),[201,409]);const a=starts.find(r=>r.status===201).data.session;assert.equal(new Date(a.expires_at)-new Date(a.starts_at),60000);report.checks.push('role and section authorization; racing starts produce one 60-second session');
 let current=await request(coordinator,'/current');assert.equal(current.data.roster.length,2);assert.equal((await request(student,'/current')).data.roster,undefined);assert.equal((await request(outsider,'/current')).data.session,null);assert.equal((await request(outsider,'/check-in',{session_id:a.id,challenge_id:id(),frames})).status,403);report.checks.push('snapshot roster and scoped reads; other-section check-in rejected');
 assert.equal((await request(student,'/check-in',{session_id:a.id})).status,400);
 assert.equal((await request(student,'/challenge',{session_id:a.id})).status,409);
 for(const m of [coordinator,student])assert.equal((await request(m,'/face/enroll',{image:frames[0],consent:true})).status,201);
 assert.equal((await request(student,'/configuration')).data.face_enrolled,true);
 assert.equal((await request(student,'/face/enroll',{image:frames[0],consent:true})).status,409);
 const camera=await cameraPayload(student,a.id);rejectFace=true;assert.equal((await request(student,'/check-in',camera)).status,422);rejectFace=false;rejectBlink=true;assert.equal((await request(student,'/check-in',camera)).status,422);rejectBlink=false;
 assert.equal((await request(outsider,'/check-in',camera)).status,403);
 report.checks.push('button-only bypass rejected; reference required; mismatched face, missed blink and borrowed challenge rejected');
 const submissions=await Promise.all([request(student,'/check-in',camera),request(student,'/check-in',camera)]);assert.equal(submissions.filter(r=>r.status===201).length,1);assert(submissions.some(r=>[403,409].includes(r.status)));assert.equal(submissions.find(r=>r.status===201).data.status,'PRESENT');assert.equal((await request(student,'/current')).data.own_status,'PRESENT');report.checks.push('one accepted record under duplicate race; saved student result');
 await admin.query("update local_attendance_demo_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.id]);current=await request(coordinator,'/current');assert.equal(current.data.phase,'late');assert.equal(current.data.own_status,'ABSENT');assert.equal(current.data.roster.find(r=>r.roll_number==='DEMO-0').status,'ABSENT');assert.equal((await request(coordinator,'/check-in',await cameraPayload(coordinator,a.id))).data.status,'LATE');report.checks.push('main deadline projects absence; explicit late check-in stores LATE');
 await admin.query("update local_attendance_demo_sessions set late_expires_at=clock_timestamp()-interval '1 second' where id=$1",[a.id]);assert.equal((await request(coordinator,'/challenge',{session_id:a.id})).status,409);assert.equal((await request(coordinator,'/current')).data.phase,'final');assert.equal((await request(coordinator,'/start',{section_id:section})).status,201);report.checks.push('terminal deadline enforced; repeated demonstration can start after completion');
 assert.equal((await admin.query('select count(*)::int n from attendance_records')).rows[0].n,0);assert.equal((await admin.query('select count(*)::int n from attendance_sessions')).rows[0].n,0);report.checks.push('official attendance tables untouched');report.passed=true;console.log(JSON.stringify(report,null,2));
} catch(e){report.error=e.message;process.exitCode=1;console.error(e);} finally {globalThis.fetch=originalFetch;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(pool)await pool.end();await admin.end();await mkdir(path.join(root,'.tmp'),{recursive:true});await writeFile(path.join(root,'.tmp/local-attendance-demo-results.json'),JSON.stringify(report,null,2)+'\n');}
