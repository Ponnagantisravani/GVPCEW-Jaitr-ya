// Synthetic data and Google responses exist only in this standalone test process.
// This script refuses non-local or nonempty databases; it never imports server.js.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';
import {productionMigrations} from '../src/config/productionMigrations.js';
const repository=fileURLToPath(new URL('../../',import.meta.url));
const usage='Usage: node backend/scripts/simulate-mobile-attendance.mjs --database-url postgresql://attendance_simulator@127.0.0.1:55432/attendance_load_test [--report .tmp/attendance-load-results.json] [--integrity-delay-ms 120] [--accelerate-close]';
const args=process.argv.slice(2),options={url:process.env.ATTENDANCE_TEST_DATABASE_URL,report:path.join(repository,'.tmp/attendance-load-results.json'),integrityDelay:120,realTimeClose:true};
if(args.includes('--help')){console.log(usage);process.exit(0);}
for(let i=0;i<args.length;i++){
 if(args[i]==='--database-url')options.url=args[++i];else if(args[i]==='--report')options.report=path.resolve(args[++i]);else if(args[i]==='--integrity-delay-ms')options.integrityDelay=Number(args[++i]);else if(args[i]==='--accelerate-close')options.realTimeClose=false;else throw new Error(usage);
}
let database;try{database=new URL(options.url);}catch{throw new Error('A dedicated local ATTENDANCE_TEST_DATABASE_URL is required. '+usage);}
assert(['postgres:','postgresql:'].includes(database.protocol)&&['localhost','127.0.0.1','[::1]'].includes(database.hostname)&&database.pathname==='/attendance_load_test','Use only the dedicated local attendance_load_test database.');
assert(Number.isFinite(options.integrityDelay)&&options.integrityDelay>=0&&options.integrityDelay<=5000,'Integrity delay must be 0–5000 ms.');
// Override before dynamically importing application configuration; no real credentials are used.
process.env.DATABASE_URL=database.href;process.env.DATABASE_SSL_MODE='disable';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.NODE_ENV='test';process.env.MOBILE_FACE_THRESHOLD='.8';
process.env.PLAY_INTEGRITY_PACKAGE_NAME='com.gvpcew.attendance';process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER='123456789012';process.env.PLAY_INTEGRITY_CERT_SHA256='synthetic-test-certificate';
const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'simulation@example.invalid',private_key:privateKey});process.env.FCM_PROJECT_ID='synthetic-test-project';process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'synthetic-test-project',client_email:'simulation@example.invalid',private_key:privateKey});
const report={generated_at:new Date().toISOString(),mode:'local-postgresql-real-routes',google_integrity:'synthetic verdicts in test process only',google_decode_delay_ms:options.integrityDelay,face:'unique synthetic normalized 192-value templates; no camera',main_closure:options.realTimeClose?'real 60-second deadline and lifecycle worker':'accelerated fixture deadline',late_expiry:'accelerated fixture deadline',scenarios:[],passed:false,limitations:['Local database/HTTP timings do not establish production or Google performance.','FCM transport, native liveness, BLE proximity, real Google verdicts and physical classroom timing are not simulated.']};
const admin=new pg.Pool({connectionString:database.href,ssl:false,max:4});let pool,server,stopWorker;const originalFetch=globalThis.fetch,proofs=new Map();let databaseReady=false;
try{
 await admin.query('select 1');
 const existing=await admin.query("select count(*)::int n from information_schema.tables where table_schema='public'");
 assert.equal(existing.rows[0].n,0,'The test database must be empty. Create a fresh disposable cluster; existing data is never reset.');
 for(const filename of productionMigrations)await admin.query(await readFile(path.join(repository,'database',filename),'utf8'));
 databaseReady=true;
 ({pool}=await import('../src/config/db.js'));
 const {mobileAttendanceRouter}=await import('../src/routes/mobileAttendance.js');
 const {requestHash}=await import('../src/services/mobileAttendancePolicy.js');
 const {closeExpiredSessions,autoStartTimetableSessions,startAttendanceLifecycleWorker}=await import('../src/services/mobileAttendanceLifecycle.js');
 const app=express();app.use(express.json());app.use('/api/attendance',mobileAttendanceRouter);app.use((error,_req,res,_next)=>res.status(error.status||500).json({message:error.message}));
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api/attendance';
 globalThis.fetch=async(url,init)=>{
  const target=String(url);
  if(target==='https://oauth2.googleapis.com/token')return Response.json({access_token:'synthetic-oauth-token',expires_in:3600});
  if(target.startsWith('https://playintegrity.googleapis.com/')){
   const token=JSON.parse(init.body).integrity_token,proof=proofs.get(token);await delay(options.integrityDelay);if(proof?.onDecode)await proof.onDecode();
   return Response.json({tokenPayloadExternal:{requestDetails:{requestPackageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,requestHash:proof?.hash||'unknown-proof',timestampMillis:String(Date.now())},appIntegrity:{packageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,appRecognitionVerdict:'PLAY_RECOGNIZED',certificateSha256Digest:['synthetic-test-certificate']},deviceIntegrity:{deviceRecognitionVerdict:proof?.denied?[]:['MEETS_DEVICE_INTEGRITY']}}});
  }
  throw new Error('Simulation blocked an unexpected external request.');
 };
 const headers=member=>({Authorization:'Bearer '+member.jwt,'Content-Type':'application/json'});
 async function request(member,endpoint,body){const start=performance.now();const res=await originalFetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:headers(member),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:res.status,data:await res.json(),ms:performance.now()-start};}
 const id=()=>crypto.randomUUID();
 function vector(seed){const values=Array.from({length:192},(_,i)=>crypto.createHash('sha256').update(seed+':'+i).digest().readInt16BE(0)/32768);const norm=Math.hypot(...values);return values.map(value=>value/norm);}
 const department=id(),subject=id(),facultyUser=id(),faculty=id(),room=id();
 await admin.query('insert into departments(id,name) values($1,$2)',[department,'Synthetic CSE']);
 await admin.query('insert into users(id,full_name,email,password_hash,role) values($1,$2,$3,$4,$5)',[facultyUser,'Synthetic Faculty','faculty@simulation.invalid','not-a-login-hash','faculty']);await admin.query('insert into user_roles values($1,$2)',[facultyUser,'faculty']);
 await admin.query('insert into faculty(id,user_id,department_id,employee_code) values($1,$2,$3,$4)',[faculty,facultyUser,department,'SIM-FACULTY']);
 await admin.query('insert into subjects(id,code,name,department_id,faculty_id) values($1,$2,$3,$4,$5)',[subject,'SIM101','Synthetic Subject',department,faculty]);
 await admin.query('insert into classrooms(id,room_code,building_name,room_name) values($1,$2,$3,$4)',[room,'SIM-ROOM','Synthetic Building','Synthetic Room']);
 const teacher={userId:facultyUser,jwt:jwt.sign({sub:facultyUser},process.env.JWT_SECRET,{expiresIn:'1h'})};
 async function cohort(label,count=70){
  const c={label,section:id(),period:id(),members:[],session:null};
  await admin.query('insert into academic_sections(id,department_id,year_number,semester_number,section_name,academic_year) values($1,$2,3,5,$3,$4)',[c.section,department,label,'2026-2027']);
  await admin.query("insert into timetable(id,subject_id,classroom_id,faculty_id,day_of_week,start_time,end_time,academic_year,academic_section_id,status,entry_type) values($1,$2,$3,$4,extract(dow from clock_timestamp() at time zone 'Asia/Kolkata'),((clock_timestamp() at time zone 'Asia/Kolkata')::time-interval '30 seconds'),((clock_timestamp() at time zone 'Asia/Kolkata')::time+interval '45 minutes'),$5,$6,'published','class')",[c.period,subject,room,faculty,'2026-2027',c.section]);
  for(let i=0;i<count;i++){
   const m={userId:id(),studentId:id(),device:'synthetic_device_'+id(),vector:vector(label+':'+i)};m.jwt=jwt.sign({sub:m.userId},process.env.JWT_SECRET,{expiresIn:'1h'});
   await admin.query('insert into users(id,full_name,email,password_hash,role) values($1,$2,$3,$4,$5)',[m.userId,'Synthetic Student '+i,m.userId+'@simulation.invalid','not-a-login-hash','student']);await admin.query('insert into user_roles values($1,$2)',[m.userId,'student']);
   if(i<2){await admin.query('insert into user_roles values($1,$2)',[m.userId,'student_coordinator']);await admin.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2)',[m.userId,c.section]);}
   await admin.query("insert into students(id,user_id,department_id,roll_number,academic_section_id,face_embedding,embedding_model,face_enrolled,enrollment_status,bound_device_id) values($1,$2,$3,$4,$5,$6,'mobilefacenet-v1',true,'approved',$7)",[m.studentId,m.userId,department,label+'-'+i,c.section,m.vector,m.device]);
   await admin.query('insert into mobile_fcm_devices(user_id,device_id,fcm_token,can_advertise) values($1,$2,$3,true)',[m.userId,m.device,'synthetic-fcm-'+m.userId]);c.members.push(m);
  }return c;
 }
 async function start(c,coordinator=0){const m=c.members[coordinator];return request(m,'/session/start',{section_id:c.section,timetable_id:c.period,device_id:m.device});}
 async function loadSession(c){const rows=(await admin.query('select * from attendance_sessions where mobile_mode and academic_section_id=$1',[c.section])).rows;assert.equal(rows.length,1,c.label+' must have exactly one session');c.session=rows[0];return c.session;}
 async function bleToken(c){const row=(await admin.query("select t.token from ble_tokens t join attendance_sessions a on a.id=t.session_id where t.session_id=$1 and t.slot=floor(extract(epoch from (clock_timestamp()-a.starts_at))/8)::int",[c.session.id])).rows[0];assert(row,'Main session needs a current rotating token');return row.token;}
 async function challenge(c,m,method='ble'){
  const token=method==='ble'?await bleToken(c):undefined;const result=await request(m,'/session/'+c.session.id+'/challenge',{device_id:m.device,method,...(token?{ble_token:token}:{})});assert.equal(result.status,201,c.label+' challenge: '+JSON.stringify(result.data));return {challenge:result.data.challenge,token};
 }
 function payload(c,m,ch,method='ble',extra={}){
  const body={student_id:m.studentId,device_id:m.device,challenge_id:ch.challenge.id,challenge_type:ch.challenge.challenge_type,liveness_result:true,embedding_model:'mobilefacenet-v1',embedding:[...m.vector],...(method==='ble'?{ble_token:ch.token}:{}),timestamp:new Date().toISOString(),...extra,integrity_token:crypto.randomBytes(24).toString('hex')};proofs.set(body.integrity_token,{hash:requestHash(c.session.id,body,method)});return body;
 }
 const submit=(c,m,body,method='ble')=>request(m,'/session/'+c.session.id+(method==='ble'?'/submit':'/late-checkin'),body);
 async function mark(c,m,method='ble'){const began=performance.now();const ch=await challenge(c,m,method),body=payload(c,m,ch,method),result=await submit(c,m,body,method);assert.equal(result.status,201,c.label+' submit: '+JSON.stringify(result.data));assert.equal(result.data.status,method==='ble'?'PRESENT':'LATE');return {ms:performance.now()-began,result};}
 async function counts(c,expected){const rows=(await admin.query('select status,count(*)::int n from attendance_records where session_id=$1 group by status',[c.session.id])).rows;const result={PRESENT:0,LATE:0,ABSENT:0};for(const row of rows)result[row.status]=row.n;assert.deepEqual(result,expected);const response=await request(c.members[0],'/session/'+c.session.id+'/status');assert.equal(response.status,200);assert.equal(response.data.total,70);assert.equal(response.data.present,expected.PRESENT);assert.equal(response.data.late,expected.LATE);assert.equal(response.data.unmarked.length,70-expected.PRESENT-expected.LATE);return result;}
 function timings(samples){const values=samples.map(r=>r.ms).sort((a,b)=>a-b);return {p50_ms:+values[Math.floor((values.length-1)*.5)].toFixed(1),p95_ms:+values[Math.floor((values.length-1)*.95)].toFixed(1),max_ms:+values.at(-1).toFixed(1)};}
 function record(name,data){const result={name,passed:true,...data};report.scenarios.push(result);console.log(name+': PASS '+JSON.stringify(data));}

 const single=await cohort('Single70');let began=performance.now();let started=await start(single);assert.equal(started.status,201,JSON.stringify(started.data));await loadSession(single);
 const one=await Promise.all(single.members.map(m=>mark(single,m)));await counts(single,{PRESENT:70,LATE:0,ABSENT:0});const elapsed=performance.now()-began;assert(elapsed<60000,'One-section local software burst exceeded 60 seconds');record('70 simultaneous students',{students:70,elapsed_ms:+elapsed.toFixed(1),...timings(one)});

 const four=[];for(let i=0;i<4;i++)four.push(await cohort('Concurrent'+i));began=performance.now();
 const auto=autoStartTimetableSessions();const manual=Promise.all(four.flatMap(c=>[start(c,0),start(c,1)]));const [autoCount,manualResults]=await Promise.all([auto,manual]);assert(manualResults.every(r=>[201,409].includes(r.status)),'Racing manual starts must succeed or report an existing session');
 for(const c of four){await loadSession(c);const n=(await admin.query('select (select count(*) from session_roster where session_id=$1)::int roster,(select count(*) from ble_tokens where session_id=$1)::int tokens,(select count(*) from mobile_push_outbox where session_id=$1)::int pushes,(select count(*) from broadcasters where session_id=$1)::int helpers',[c.session.id])).rows[0];assert.deepEqual(n,{roster:70,tokens:8,pushes:70,helpers:3});}
 const burst=await Promise.all(four.flatMap(c=>c.members.map(m=>mark(c,m))));for(const c of four)await counts(c,{PRESENT:70,LATE:0,ABSENT:0});const fourElapsed=performance.now()-began;assert(fourElapsed<60000,'Four-section local software burst exceeded 60 seconds');record('four independent sections and racing starts',{sections:4,students:280,automatic_starts:autoCount,elapsed_ms:+fourElapsed.toFixed(1),...timings(burst)});

 const duplicates=await cohort('Duplicate70');assert.equal((await start(duplicates)).status,201);await loadSession(duplicates);began=performance.now();
 const races=await Promise.all(duplicates.members.map(async(m,index)=>{const first=await challenge(duplicates,m),second=index<35?first:await challenge(duplicates,m);const result=await Promise.all([submit(duplicates,m,payload(duplicates,m,first)),submit(duplicates,m,payload(duplicates,m,second))]);assert.equal(result.filter(r=>r.status===201).length,1);assert(result.some(r=>[403,409].includes(r.status)));return result;}));await counts(duplicates,{PRESENT:70,LATE:0,ABSENT:0});record('duplicate races',{students:70,submissions:140,accepted:70,rejected:70,shared_challenge_students:35,different_challenge_students:35,elapsed_ms:+(performance.now()-began).toFixed(1)});

 const negative=await cohort('Invalid70');assert.equal((await start(negative)).status,201);await loadSession(negative);const owner=negative.members[0],other=negative.members[1];let ch=await challenge(negative,owner);let rejected=0;
 async function expectRejected(m,body,expected,endpoint){const result=endpoint?await request(m,endpoint,body):await submit(negative,m,body);assert.equal(result.status,expected,JSON.stringify(result.data));rejected++;}
 await expectRejected(owner,payload(negative,owner,ch,'ble',{student_id:other.studentId}),403);
 await expectRejected(owner,payload(negative,owner,ch,'ble',{device_id:other.device}),403);
 await expectRejected(owner,payload(negative,owner,ch,'ble',{embedding:other.vector}),422);
 ch=await challenge(negative,owner);
 await expectRejected(owner,payload(negative,owner,ch,'ble',{embedding_model:'legacy-unknown'}),400);
 await expectRejected(owner,payload(negative,owner,ch,'ble',{liveness_result:false}),400);
 await expectRejected(owner,payload(negative,owner,ch,'ble',{timestamp:new Date(Date.now()-30000).toISOString()}),400);
 const otherSectionToken=crypto.randomBytes(12).toString('hex');await expectRejected(owner,payload(negative,owner,ch,'ble',{ble_token:otherSectionToken}),403);
 await expectRejected(owner,{device_id:owner.device,method:'ble',ble_token:ch.token},403,'/session/'+four[0].session.id+'/challenge');
 const future=(await admin.query('select token from ble_tokens where session_id=$1 and slot=7',[negative.session.id])).rows[0].token;await expectRejected(owner,{device_id:owner.device,method:'ble',ble_token:future},403,'/session/'+negative.session.id+'/challenge');
 let body=payload(negative,owner,ch);proofs.get(body.integrity_token).denied=true;await expectRejected(owner,body,403);
 body=payload(negative,owner,ch);proofs.get(body.integrity_token).hash='altered-hash';await expectRejected(owner,body,403);
 body=payload(negative,owner,ch);proofs.get(body.integrity_token).onDecode=()=>admin.query("update students set enrollment_status='required' where id=$1",[owner.studentId]);await expectRejected(owner,body,403);await admin.query("update students set enrollment_status='approved' where id=$1",[owner.studentId]);
 body=payload(negative,owner,ch);proofs.get(body.integrity_token).onDecode=()=>admin.query('update students set academic_section_id=$2 where id=$1',[owner.studentId,four[0].section]);await expectRejected(owner,body,403);await admin.query('update students set academic_section_id=$2 where id=$1',[owner.studentId,negative.section]);
 const budgetStudent=negative.members[3];for(let i=0;i<3;i++)await challenge(negative,budgetStudent);await expectRejected(budgetStudent,{device_id:budgetStudent.device,method:'ble',ble_token:await bleToken(negative)},429,'/session/'+negative.session.id+'/challenge');
 const expiredStudent=negative.members[2],expires=await challenge(negative,expiredStudent);body=payload(negative,expiredStudent,expires);proofs.get(body.integrity_token).onDecode=()=>admin.query("update attendance_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[negative.session.id]);await expectRejected(expiredStudent,body,409);
 assert.equal((await admin.query('select count(*)::int n from attendance_records where session_id=$1',[negative.session.id])).rows[0].n,0);
 const closeResults=await Promise.all([closeExpiredSessions(pool,negative.section),closeExpiredSessions(pool,negative.section)]);assert.equal(closeResults.reduce((n,value)=>n+value,0),1);const closedAudits=(await admin.query("select count(*)::int n from audit_log where session_id=$1 and event='session_auto_closed'",[negative.session.id])).rows[0].n;assert.equal(closedAudits,1);
 await counts(negative,{PRESENT:0,LATE:0,ABSENT:70});await challenge(negative,budgetStudent,'fallback');record('rejection, locked rechecks, separate challenge budgets and racing closure',{rejected_attempts:rejected,accepted:0,absent:70,closure_audits:1});

 const automatic=await cohort('Timetable70');began=performance.now();assert.equal(await autoStartTimetableSessions(),1);await loadSession(automatic);assert.equal(automatic.session.start_source,'timetable');const automaticMarks=await Promise.all(automatic.members.map(m=>mark(automatic,m)));await counts(automatic,{PRESENT:70,LATE:0,ABSENT:0});record('timetable auto-start without manual intervention',{students:70,automatic_starts:1,elapsed_ms:+(performance.now()-began).toFixed(1),...timings(automaticMarks)});

 const mixed=await cohort('Late70');assert.equal((await start(mixed)).status,201);await loadSession(mixed);await Promise.all(mixed.members.slice(0,56).map(m=>mark(mixed,m)));await counts(mixed,{PRESENT:56,LATE:0,ABSENT:0});
 let early=await request(mixed.members[56],'/session/'+mixed.session.id+'/challenge',{device_id:mixed.members[56].device,method:'fallback'});assert.equal(early.status,409);
 if(options.realTimeClose){
  console.log('Waiting for the real 60-second session deadline and lifecycle worker closure...');stopWorker=startAttendanceLifecycleWorker();const limit=new Date(mixed.session.expires_at).getTime()+10000;
  while(Date.now()<limit){const row=(await admin.query('select status from attendance_sessions where id=$1',[mixed.session.id])).rows[0];if(row.status==='closed')break;await delay(250);}
  stopWorker();stopWorker=undefined;
 }else{await admin.query("update attendance_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[mixed.session.id]);await closeExpiredSessions();}
 await counts(mixed,{PRESENT:56,LATE:0,ABSENT:14});
 const lag=(await admin.query("select extract(epoch from (l.created_at-a.expires_at))*1000 ms from audit_log l join attendance_sessions a on a.id=l.session_id where l.event='session_auto_closed' and a.id=$1",[mixed.session.id])).rows[0];assert(lag,'Closure must write an audit');if(options.realTimeClose)assert(Number(lag.ms)<3000,'Local closure materialization exceeded 3 seconds after its deadline');
 const late=await Promise.all(mixed.members.slice(56,63).map(m=>mark(mixed,m,'fallback')));await counts(mixed,{PRESENT:56,LATE:7,ABSENT:7});
 let duplicate=await request(mixed.members[56],'/session/'+mixed.session.id+'/challenge',{device_id:mixed.members[56].device,method:'fallback'});assert.equal(duplicate.status,409);
 let acceptedMain=await request(mixed.members[0],'/session/'+mixed.session.id+'/challenge',{device_id:mixed.members[0].device,method:'fallback'});assert.equal(acceptedMain.status,409);
 const teacherReport=await request(teacher,'/session/'+mixed.session.id+'/report');assert.equal(teacherReport.status,200);assert.equal(teacherReport.data.students.filter(s=>s.review_required).length,7);assert.equal(teacherReport.data.students.filter(s=>s.status==='ABSENT').length,7);
 const privateReport=await request(mixed.members[63],'/session/'+mixed.session.id+'/report');assert.equal(privateReport.status,403);const history=await request(mixed.members[63],'/history');assert.equal(history.status,200);assert.equal(history.data.attendance.length,1);assert.equal(history.data.attendance[0].status,'ABSENT');
 await admin.query("update attendance_sessions set late_expires_at=clock_timestamp()-interval '1 second' where id=$1",[mixed.session.id]);const after=await request(mixed.members[63],'/session/'+mixed.session.id+'/challenge',{device_id:mixed.members[63].device,method:'fallback'});assert.equal(after.status,409);await closeExpiredSessions();await counts(mixed,{PRESENT:56,LATE:7,ABSENT:7});
 record('main closure, late recovery and read-only reports',{students:70,present:56,late:7,absent:7,closure_materialized_lag_ms:+Number(lag.ms).toFixed(1),late_timings:timings(late)});

 const invalidRows=(await admin.query("select count(*)::int n from attendance_records where (status='PRESENT' and (method is distinct from 'ble' or is_late)) or (status='LATE' and (method is distinct from 'fallback' or not is_late)) or (status='ABSENT' and (method is not null or is_late))")).rows[0].n;assert.equal(invalidRows,0);
 assert.equal((await admin.query('select count(*)::int n from attendance_records a left join session_roster r on r.session_id=a.session_id and r.student_id=a.student_id where r.student_id is null')).rows[0].n,0);
 report.postgresql_version=(await admin.query('show server_version')).rows[0].server_version;report.pool_max=pool.options.max;report.fixture_pool_max=admin.options.max;report.simulator_sha256=crypto.createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');report.passed=true;console.log('All simulated scenarios passed. Physical phone/range/classroom tests remain pending.');
}catch(error){report.error=error.message;console.error('Attendance simulation failed: '+error.message);process.exitCode=1;}
finally{
 stopWorker?.();globalThis.fetch=originalFetch;
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(pool)await pool.end();await admin.end();
 report.actual_migrations_applied_to_empty_test_database=databaseReady;await mkdir(path.dirname(options.report),{recursive:true});await writeFile(options.report,JSON.stringify(report,null,2)+'\n');console.log('Report written: '+options.report);
}
