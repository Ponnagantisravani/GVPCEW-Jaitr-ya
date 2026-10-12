// Real PostgreSQL and actual HTTP routes; every fixture is rolled back.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.NODE_ENV='development';process.env.LOCAL_ATTENDANCE_DEMO='true';
const {pool}=await import('../src/config/db.js');const {env}=await import('../src/config/env.js');
const {createApp}=await import('../src/app.js');const {markPresent,closeExpiredSubjectSessions}=await import('../src/services/subjectAttendance.js');
const {default:jwt}=await import('jsonwebtoken');
const c=await pool.connect(),originalQuery=pool.query,originalConnect=pool.connect;let server,checks=0;
const uid=()=>crypto.randomUUID();const coordinator=uid(),student=uid(),other=uid(),teacher=uid(),outsider=uid(),section=uid();
try{
 await c.query('begin');
 const dept=(await c.query("select id from departments where name in ('CSE','Computer Science Engineering','Computer Science and Engineering') limit 1")).rows[0].id;
 await c.query('insert into academic_sections(id,department_id,year_number,semester_number,section_name,academic_year) values($1,$2,3,5,$3,$4)',[section,dept,'Subject-test-'+section,'2026-2027']);
 for(const [id,email,role] of [[coordinator,'test-coordinator-'+coordinator+'@example.com','student'],[student,'test-student-'+student+'@example.com','student'],[other,'test-other-'+other+'@example.com','student'],[teacher,'test-indu-'+teacher+'@example.com','faculty'],[outsider,'test-faculty-'+outsider+'@example.com','faculty']]){
  await c.query('insert into users(id,full_name,email,password_hash,role,active) values($1,$2,$3,$4,$5,true)',[id,'Subject attendance test',email,'test-only-unusable-hash',role]);
  await c.query('insert into user_roles(user_id,role) values($1,$2)',[id,role]);
 }
 await c.query("update subject_attendance_subjects set faculty_email=$1 where faculty_email='indu@gvpcew.ac.in'",['test-indu-'+teacher+'@example.com']);
 await c.query("insert into user_roles(user_id,role) values($1,'student_coordinator')",[coordinator]);
 for(const id of [coordinator,student,other])await c.query('insert into students(id,user_id,department_id,roll_number,academic_section_id) values($1,$1,$2,$3,$4)',[id,dept,'TEST-'+id,section]);
 await c.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2)',[coordinator,section]);
 const faculty=uid(),room=uid();await c.query('insert into faculty(id,user_id,department_id,employee_code) values($1,$2,$3,$4)',[faculty,teacher,dept,'TEST-'+faculty]);
 await c.query("insert into classrooms(id,room_code,building_name,room_name) values($1,$2,'Test','Test')",[room,'TEST-'+room]);
 const subjects=(await c.query('select * from subject_attendance_subjects')).rows;const lab=subjects.find(s=>s.display_name==='Computer Networks Lab'),theory=subjects.find(s=>s.display_name==='Computer Networks'),foreign=subjects.find(s=>s.display_name==='Compiler Design');
 for(const s of subjects)await c.query('insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number) values($1,$2,$3,5)',[section,s.subject_id,s.kind]);
 for(let p=1;p<=7;p++){const s=p<=3||p===7?lab:theory;await c.query("insert into timetable(subject_id,classroom_id,faculty_id,day_of_week,start_time,end_time,academic_year,academic_section_id,status,entry_type) values($1,$2,$3,extract(dow from clock_timestamp() at time zone 'Asia/Kolkata'),$4,$5,'2026-2027',$6,'published',$7)",[s.subject_id,room,faculty,String(8+p).padStart(2,'0')+':00',String(9+p).padStart(2,'0')+':00',section,s.kind==='lab'?'lab':'class']);}
 let transaction=0;pool.query=(...args)=>c.query(...args);pool.connect=async()=>{const name='subject_test_'+(++transaction);return {query:(sql,args)=>c.query(sql==='begin'?'savepoint '+name:sql==='commit'?'release savepoint '+name:sql==='rollback'?'rollback to savepoint '+name:sql,args),release(){}};};
 const app=createApp();server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/attendance';
 const call=async(user,path,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt.sign({sub:user},env.jwtSecret,{expiresIn:'5m'}),'Content-Type':'application/json','X-Portal-Role':user===coordinator?'student_coordinator':user===teacher||user===outsider?'faculty':'student'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 let r=await call(coordinator,'/subjects');assert.equal(r.status,200);assert.equal(r.data.subjects.length,8);checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:1});assert.equal(r.status,201,JSON.stringify(r.data));const first=r.data.session;assert.deepEqual(first.periods,[1,2,3]);assert.equal(Math.round((new Date(first.expires_at)-new Date(first.started_at))/1000),600);checks++;
 let records=(await c.query('select * from subject_attendance_records where session_id=$1',[first.id])).rows;assert.equal(records.length,9);assert(records.every(r=>r.status==='Pending'));checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:2});assert.equal(r.status,409);checks++;
 await markPresent(first.source_session_id,student,c);await markPresent(first.source_session_id,student,c);records=(await c.query('select * from subject_attendance_records where session_id=$1 and student_id=$2',[first.id,student])).rows;assert.equal(records.length,3);assert(records.every(r=>r.status==='Present'));assert.equal((await c.query('select count(*)::int n from subject_attendance_marks where session_id=$1',[first.id])).rows[0].n,1);checks++;
 r=await call(student,'/student/attendance?studentId='+other);assert.equal(r.status,200);assert.equal(r.data.records.length,3);assert(r.data.records.every(r=>r.status==='Present'));assert.equal(r.data.subjects.find(s=>s.subject_id===lab.subject_id&&s.source_kind==='demo').attended,3);checks++;
 const date=(await c.query("select to_char((clock_timestamp() at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD') d")).rows[0].d;
 r=await call(teacher,'/faculty/subjects');assert.equal(r.status,200);assert.equal(r.data.subjects.length,2);checks++;
 r=await call(teacher,'/faculty/subjects/'+lab.subject_id+'/attendance?date='+date+'&period=2');assert.equal(r.status,200,JSON.stringify(r.data));assert.deepEqual(r.data.counts,{present:1,absent:0,pending:2,total:3,percentage:33.3});checks++;
 for(const [user,path,body] of [[student,'/subjects'],[student,'/sessions',{subjectId:lab.subject_id,period:1}],[coordinator,'/faculty/subjects'],[teacher,'/student/attendance'],[outsider,'/faculty/subjects/'+lab.subject_id+'/attendance?date='+date+'&period=1'],[teacher,'/faculty/subjects/'+foreign.subject_id+'/attendance?date='+date+'&period=1'],[student,'/sessions/'+first.id+'/end',{}]]){r=await call(user,path,body);assert.equal(r.status,403,JSON.stringify(r));checks++;}
 r=await call(coordinator,'/sessions/'+first.id+'/end',{});assert.equal(r.status,200);records=(await c.query('select * from subject_attendance_records where session_id=$1',[first.id])).rows;assert.equal(records.filter(r=>r.status==='Absent').length,6);assert.equal(records.filter(r=>r.status==='Present').length,3);checks++;
 await assert.rejects(()=>markPresent(first.source_session_id,other,c),e=>e.status===409);checks++;
 r=await call(coordinator,'/sessions',{subjectId:theory.subject_id,period:4,durationSeconds:30});assert.equal(r.status,201,JSON.stringify(r.data));assert.deepEqual(r.data.session.periods,[4]);const second=r.data.session;checks++;
 await c.query("update subject_attendance_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[second.id]);await closeExpiredSubjectSessions();assert.equal((await c.query("select count(*)::int n from subject_attendance_records where session_id=$1 and status='Absent'",[second.id])).rows[0].n,3);checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:7});assert.equal(r.status,201,JSON.stringify(r.data));assert.deepEqual(r.data.session.periods,[7]);checks++;

 await call(coordinator,'/sessions/'+r.data.session.id+'/end',{});
 for(let p=8;p<=10;p++)await c.query("insert into timetable(subject_id,classroom_id,faculty_id,day_of_week,start_time,end_time,academic_year,academic_section_id,status,entry_type) values($1,$2,$3,extract(dow from clock_timestamp() at time zone 'Asia/Kolkata'),$4,$5,'2026-2027',$6,'published','lab')",[lab.subject_id,room,faculty,String(8+p)+':00',String(9+p)+':00',section]);
 const batch1=uid(),batch2=uid();for(const [id,name] of [[batch1,'Batch 1'],[batch2,'Batch 2']])await c.query('insert into subject_attendance_batches(id,section_id,name) values($1,$2,$3)',[id,section,name]);
 for(const [b,s] of [[batch1,coordinator],[batch1,student],[batch2,other]])await c.query('insert into subject_attendance_batch_members values($1,$2)',[b,s]);
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:8});assert.equal(r.status,400);checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:8,batchId:batch1});assert.equal(r.status,201,JSON.stringify(r.data));const batchSession=r.data.session;assert.deepEqual(batchSession.periods,[8,9,10]);assert.equal((await c.query('select count(*)::int n from subject_attendance_roster where session_id=$1',[batchSession.id])).rows[0].n,2);checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:8,batchId:batch2});assert.equal(r.status,201,JSON.stringify(r.data));checks++;
 r=await call(coordinator,'/sessions',{subjectId:lab.subject_id,period:9,batchId:batch1});assert.equal(r.status,409);checks++;
 await assert.rejects(()=>markPresent(batchSession.source_session_id,other,c),e=>e.status===403);checks++;
 await c.query('delete from section_subjects where academic_section_id=$1 and subject_id=$2',[section,foreign.subject_id]);r=await call(coordinator,'/sessions',{subjectId:foreign.subject_id,period:4});assert.equal(r.status,403);checks++;
 await c.query('savepoint direct_constraint');await assert.rejects(()=>c.query('insert into subject_attendance_claims select * from subject_attendance_claims where session_id=$1 limit 1',[batchSession.id]),e=>e.code==='23505');await c.query('rollback to savepoint direct_constraint');checks++;

 console.log('Passed '+checks+' PostgreSQL + HTTP checks: lab/theory/clipping/overlap/idempotency/closure/privacy/faculty ownership. Fixtures rolled back.');
}finally{pool.query=originalQuery;pool.connect=originalConnect;if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await c.query('rollback');c.release();await pool.end();}
