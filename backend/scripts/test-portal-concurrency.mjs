// Real routes and SQL in a fresh disposable local database, never campus data.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import bcrypt from 'bcrypt';
import bcryptjs from 'bcryptjs';
import {productionMigrations} from '../src/config/productionMigrations.js';
const url=new URL(process.env.ATTENDANCE_TEST_DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&url.pathname==='/attendance_load_test','Dedicated local test database required');
process.env.DATABASE_URL=url.href;process.env.DATABASE_SSL_MODE='disable';process.env.NODE_ENV='test';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');
const admin=new pg.Pool({connectionString:url.href,ssl:false,max:3});
let server,pool;
const report={generated_at:new Date().toISOString(),students:70,mode:'real-login-and-dashboard-routes-local-postgresql',passed:false,scenarios:[],limitations:['Local HTTP simulation; physical Wi-Fi devices and face verification are not simulated.','This measures the current computer, not an online hosting service.','Each read batch maintains 70 simultaneous HTTP requests. The separate 350-socket burst failed on local Windows and is not certified.']};
const stats=rows=>{const times=rows.map(r=>r.ms).sort((a,b)=>a-b);return {requests:rows.length,success:rows.filter(r=>r.status===200).length,statuses:rows.reduce((s,r)=>(s[r.status]=(s[r.status]||0)+1,s),{}),p95_ms:Math.round(times[Math.ceil(times.length*.95)-1]),max_ms:Math.round(times.at(-1))};};
try{
 assert.equal((await admin.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0,'Refusing nonempty database');
 for(const file of productionMigrations)await admin.query(await readFile(new URL('../../database/'+file,import.meta.url),'utf8'));
 await admin.query("create or replace view faculty_assignments as select distinct faculty_id,subject_id,academic_section_id,'upgraded'::text migration_marker from timetable where status='published'");
 for(const file of productionMigrations)await admin.query(await readFile(new URL('../../database/'+file,import.meta.url),'utf8'));
 assert.equal((await admin.query("select count(*)::int n from information_schema.columns where table_name='faculty_assignments' and column_name='migration_marker'")).rows[0].n,1,'Preserve upgraded faculty compatibility views');
 report.scenarios.push({name:'complete production migration sequence installs and is repeatable',passed:true});
 ({pool}=await import('../src/config/db.js'));
 const {createApp}=await import('../src/app.js');
 const password=crypto.randomBytes(24).toString('hex');
 // Match existing bcryptjs cost-12 password hashes, rather than cheap test hashes.
 const hash=await bcryptjs.hash(password,12);
 assert(await bcrypt.compare(password,hash),'Native verification must accept existing password hashes');
 const department=crypto.randomUUID(),section=crypto.randomUUID();
 await admin.query('insert into departments(id,name) values($1,$2)',[department,'Synthetic portal load department']);
 await admin.query("insert into academic_sections(id,department_id,year_number,semester_number,section_name,academic_year) values($1,$2,3,5,'LOAD','2026-2027')",[section,department]);
 const members=[];
 for(let i=0;i<70;i++){
  const m={id:crypto.randomUUID(),student:crypto.randomUUID(),email:`load-${i}@test.invalid`};
  await admin.query("insert into users(id,full_name,email,password_hash,role,active) values($1,$2,$3,$4,'student',true)",[m.id,'Synthetic student '+i,m.email,hash]);
  await admin.query("insert into user_roles(user_id,role) values($1,'student')",[m.id]);
  await admin.query("insert into students(id,user_id,department_id,roll_number,academic_section_id,face_enrollment_status) values($1,$2,$3,$4,$5,'completed')",[m.student,m.id,department,'LOAD-'+i,section]);members.push(m);
 }
 server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(m,path,body){const start=performance.now();try{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(m.token?{Authorization:'Bearer '+m.token,'X-Portal-Role':'student'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),ms:performance.now()-start};}catch(e){return {status:0,data:{message:e.message,cause:e.cause?.code||e.cause?.message},ms:performance.now()-start};}}
 const start=performance.now();
 const logins=await Promise.all(members.map(async m=>{const r=await request(m,'/auth/login',{email:m.email,password});if(r.status===200){assert.equal(r.data.user.id,m.id);m.token=r.data.token;}return r;}));
 report.scenarios.push({name:'70 simultaneous logins from one shared IP',...stats(logins),elapsed_ms:Math.round(performance.now()-start)});
 assert(logins.every(r=>r.status===200),JSON.stringify(report.scenarios.at(-1)));
 for(let round=1;round<=3;round++){
  const reads=[];
  for(const path of ['/auth/me','/students/profile','/students/dashboard','/students/timetable','/students/attendance'])reads.push(...await Promise.all(members.map(async m=>{const r=await request(m,path);if(r.status===200&&path==='/students/profile')assert.equal(r.data.profile.id,m.student);if(r.status===200&&path==='/auth/me')assert.equal(r.data.user.id,m.id);return r;})));
  report.scenarios.push({name:`70 concurrent student sessions, five endpoints per student, round ${round}`,...stats(reads),errors:reads.filter(r=>r.status!==200).slice(0,3).map(r=>r.data)});
  assert(reads.every(r=>r.status===200),JSON.stringify(report.scenarios.at(-1)));
 }
 // Account throttling remains effective, without blocking classmates.
 const blocked={email:'blocked@test.invalid'};
 const bad=[];for(let i=0;i<11;i++)bad.push(await request(blocked,'/auth/login',{email:blocked.email,password:'wrong-password'}));
 assert(bad.slice(0,10).every(r=>r.status===401));assert.equal(bad[10].status,429);
 assert.equal((await request(members[0],'/auth/login',{email:members[0].email,password})).status,200);
 report.scenarios.push({name:'wrong-password account limit does not block classmates',passed:true});
 report.passed=true;
 console.log(JSON.stringify(report,null,2));
}catch(e){report.error=e.message;process.exitCode=1;console.error(e.message);}finally{
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(pool)await pool.end();await admin.end();
 await mkdir(new URL('../../.tmp/',import.meta.url),{recursive:true});await writeFile(new URL('../../.tmp/portal-70-load-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}
