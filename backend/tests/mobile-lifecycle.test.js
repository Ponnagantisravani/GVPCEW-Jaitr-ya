import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';process.env.MOBILE_FACE_THRESHOLD='.8';
process.env.PLAY_INTEGRITY_PACKAGE_NAME='com.gvpcew.attendance';process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER='123456789012';process.env.PLAY_INTEGRITY_CERT_SHA256='test';
const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.com',private_key:key});process.env.FCM_PROJECT_ID='test';process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test',client_email:'test@example.com',private_key:key});
const {closeExpiredSessions,autoStartTimetableSessions,cleanupExpiredMobileData}=await import('../src/services/mobileAttendanceLifecycle.js');
const {pool}=await import('../src/config/db.js');
const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});

test('closure fills only missing roster records, preserves PRESENT/LATE and closes sections independently exactly once',async()=>{
 const records=new Map([['A:1','PRESENT'],['A:2','LATE'],['B:1','PRESENT']]),sessions=new Map([['A','open'],['B','open']]),audit=[],calls=[];
 const db={connect:async()=>({release(){},query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.startsWith('select id from attendance_sessions')){assert(sql.includes('expires_at<=clock_timestamp()'));assert(sql.includes('for update skip locked'));return result([...sessions].filter(([id,status])=>status==='open'&&(!args[0]||args[0]===id)).map(([id])=>({id})));}
  if(sql.startsWith('insert into attendance_records')){assert(sql.includes('on conflict(session_id,student_id) do nothing'));for(const sid of [1,2,3])if(!records.has(args[0]+':'+sid))records.set(args[0]+':'+sid,'ABSENT');}
  if(sql.startsWith('update attendance_sessions'))sessions.set(args[0],'closed');
  if(sql.startsWith('insert into audit_log'))audit.push(args[0]);return result([],1);
 }})};
 assert.equal(await closeExpiredSessions(db,'A'),1);assert.equal(sessions.get('B'),'open');assert.equal(records.get('A:1'),'PRESENT');assert.equal(records.get('A:2'),'LATE');assert.equal(records.get('A:3'),'ABSENT');
 assert.equal(await closeExpiredSessions(db,'A'),0);assert.equal(await closeExpiredSessions(db),1);assert.equal(records.get('B:1'),'PRESENT');assert.equal(records.get('B:3'),'ABSENT');assert.deepEqual(audit,['A','B']);assert(calls.some(c=>c.sql.startsWith('update mobile_push_outbox')));
});
test('a failed closure rolls back and releases the connection',async()=>{
 const calls=[];let released=false;const db={connect:async()=>({release(){released=true;},query:async(sql)=>{calls.push(sql);if(sql.startsWith('select id'))return result([{id:'A'}]);if(sql.startsWith('insert into attendance_records'))throw new Error('database unavailable');return result([],1);}})};
 await assert.rejects(closeExpiredSessions(db),/database unavailable/);assert(calls.includes('rollback'));assert(!calls.includes('commit'));assert(released);
});
test('timetable fallback uses eligible bound broadcaster phones and tolerates concurrent manual starts',async()=>{
 const due=[{timetable_id:'p1',section_id:'A',user_id:'u1',bound_device_id:'d1'},{timetable_id:'p2',section_id:'B',user_id:'u2',bound_device_id:'d2'}],started=[];
 const db={query:async(sql,args)=>{assert(sql.includes("t.status='published'"));assert(sql.includes('d.can_advertise'));assert(sql.includes("s.enrollment_status='approved'"));assert(sql.includes('not exists(select 1 from attendance_sessions'));assert(sql.includes('between $2 and 120'));assert.equal(args[1],15);return result(due);}};
 assert.equal(await autoStartTimetableSessions(db,async(options)=>{started.push(options);if(options.sectionId==='B')throw Object.assign(new Error('already started'),{status:409});}),1);process.env.MOBILE_AUTO_START_GRACE_SECONDS='120';assert.equal(await autoStartTimetableSessions(db,async()=>{}),2);delete process.env.MOBILE_AUTO_START_GRACE_SECONDS;assert.equal(started[0].source,'timetable');assert.equal(started[0].deviceId,'d1');assert.equal(started[1].sectionId,'B');
 const saved=process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;assert.equal(await autoStartTimetableSessions({query(){throw new Error('unconfigured auto-start must not query');}}),0);process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=saved;
});
test('cleanup deletes expired previews and ephemeral proofs while retaining attendance, templates and audits',async()=>{
 const calls=[];await cleanupExpiredMobileData({query:async(sql)=>{calls.push(sql);return result();}});assert.equal(calls.length,3);assert(calls[0].includes('enrollment_preview=null'));assert(calls[1].startsWith('delete from ble_tokens'));assert(calls[2].includes('a.late_expires_at<=clock_timestamp()'));assert(!calls.some(sql=>/delete from (attendance_records|audit_log|students)/.test(sql)));
});

test('current windows, coordinator counts, report access and student history use the actual authenticated routes',async(t)=>{
 const {default:express}=await import('express'),{default:jwt}=await import('jsonwebtoken'),{env}=await import('../src/config/env.js'),{mobileAttendanceRouter}=await import('../src/routes/mobileAttendance.js');
 const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',section='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004',device='device_identifier_123';
 let roles=['student_coordinator'],sectionAccess=true,assigned=true,record=null;
 const s={id:sid,academic_section_id:section,face_enrolled:true,embedding_model:'mobilefacenet-v1',enrollment_status:'approved',bound_device_id:device};
 const a={id,academic_section_id:section,section:'A',period:'p',faculty_id:'faculty',coordinator_user_id:uid,status:'open',starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+60000),late_expires_at:new Date(Date.now()+180000),broadcast:true};const calls=[];
 const rows=[{student_id:'s1',roll_number:'101',full_name:'Student One',status:'PRESENT',method:'ble',similarity:.95,is_late:false},{student_id:'s2',roll_number:'102',full_name:'Student Two',status:'LATE',method:'fallback',similarity:.91,is_late:true},{student_id:'s3',roll_number:'103',full_name:'Student Three',status:'ABSENT',method:null,similarity:null,is_late:false}];
 const query=async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('from users u left join user_roles'))return result([{id:uid,roles,role:roles[0]}]);
  if(sql.startsWith('select * from students'))return result([s]);
  if(sql.startsWith('select * from attendance_sessions')||sql.startsWith('select a.*,'))return result([a]);
  if(sql.startsWith('select status,method,is_late from attendance_records'))return result(record?[record]:[]);
  if(sql.startsWith('select 1 from students')||sql.startsWith('select 1 from faculty')||sql.startsWith('select 1 from academic_sections'))return result([],sectionAccess?1:0);
  if(sql.startsWith('select 1 from student_coordinator_sections'))return result([],assigned?1:0);
  if(sql.startsWith('select name subject_name from subjects'))return result([{subject_name:'DBMS'}]);
  if(sql.startsWith('select s.id student_id'))return result(rows);
  if(sql.startsWith('select a.id,a.academic_section_id section_id'))return result([{...a,status:Date.now()>=a.expires_at.getTime()?'closed':'open'}]);
  if(sql.startsWith('select a.id session_id'))return result([{session_id:id,status:'ABSENT',method:null,is_late:false}]);
  throw new Error('Unexpected SQL '+sql);
 };
 const oldQ=pool.query;pool.query=query;const app=express();app.use(express.json());app.use('/attendance',mobileAttendanceRouter);app.use((e,_q,r,_n)=>r.status(e.status||500).json({message:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const headers={Authorization:'Bearer '+jwt.sign({sub:uid},env.jwtSecret,{expiresIn:'1h'})},base='http://127.0.0.1:'+server.address().port+'/attendance';const get=p=>fetch(base+p,{headers});
 try{
  await t.test('bound-device discovery changes from BLE to fallback to closed on the server clock',async()=>{
   let r=await get('/current?device_id='+device);assert.equal(r.status,200);let data=await r.json();assert.equal(data.phase,'ble');assert(data.valid_for_ms>0);assert.equal(data.own_record,null);
   r=await get('/current?device_id=wrong_device_12345');assert.equal(r.status,403);
   a.expires_at=new Date(Date.now()-1000);r=await get('/current?device_id='+device);data=await r.json();assert.equal(data.phase,'fallback');assert.equal(data.session.broadcast,false);assert.equal(data.own_record.status,'ABSENT');
   a.late_expires_at=new Date(Date.now()-1);r=await get('/current?device_id='+device);data=await r.json();assert.equal(data.phase,'closed');assert.equal(data.valid_for_ms,0);
   record={status:'LATE',method:'fallback',is_late:true};r=await get('/current?device_id='+device);assert.equal((await r.json()).own_record.status,'LATE');record=null;
  });
  await t.test('coordinator sees unmarked names; ordinary students receive counts only',async()=>{
   roles=['student_coordinator'];let r=await get('/session/'+id+'/status');assert.equal(r.status,200);let data=await r.json();assert.equal(data.total,3);assert.equal(data.present,1);assert.equal(data.late,1);assert.equal(data.absent,1);assert.equal(data.unmarked.length,1);assert(data.final);
   roles=['student'];r=await get('/session/'+id+'/status');data=await r.json();assert(!('unmarked' in data));sectionAccess=false;r=await get('/session/'+id+'/status');assert.equal(r.status,403);sectionAccess=true;
  });
  await t.test('teacher reports require section authority and closure, and flag late rows with similarity',async()=>{
   roles=['faculty'];a.expires_at=new Date(Date.now()+60000);let r=await get('/session/'+id+'/report');assert.equal(r.status,409);a.expires_at=new Date(Date.now()-1000);
   sectionAccess=false;r=await get('/session/'+id+'/report');assert.equal(r.status,403);sectionAccess=true;r=await get('/session/'+id+'/report');assert.equal(r.status,200);const data=await r.json();assert.equal(data.students[0].review_required,false);assert.equal(data.students[1].review_required,true);assert.equal(data.students[1].similarity,.91);assert.equal(data.students[2].status,'ABSENT');assert.equal(data.session.final,true);assert.equal(data.session.subject_name,'DBMS');
   roles=['student_coordinator'];r=await get('/session/'+id+'/report');assert.equal(r.status,403);
  });
  await t.test('session discovery is role scoped and history joins only the signed-in student roster',async()=>{
   roles=['faculty'];let r=await get('/sessions');assert.equal(r.status,200);let q=calls.at(-1);assert.deepEqual(q.args,[uid]);assert(q.sql.includes('f.id=a.faculty_id'));
   roles=['student_coordinator'];r=await get('/sessions');assert.equal(r.status,200);q=calls.at(-1);assert(q.sql.includes('own.academic_section_id=cs.academic_section_id'));
   roles=['student'];r=await get('/sessions');assert.equal(r.status,403);r=await get('/history');assert.equal(r.status,200);const data=await r.json();assert.equal(data.attendance[0].status,'ABSENT');q=calls.at(-1);assert.deepEqual(q.args,[sid]);assert(q.sql.includes('where sr.student_id=$1'));assert(q.sql.includes('left join attendance_records'));
  });
 }finally{pool.query=oldQ;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
});
