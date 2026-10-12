import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
process.env.MOBILE_FACE_THRESHOLD='.75';process.env.PLAY_INTEGRITY_PACKAGE_NAME='com.gvpcew.attendance';process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER='123456789012';process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.com',private_key:crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});process.env.PLAY_INTEGRITY_CERT_SHA256='test';process.env.FCM_PROJECT_ID='test';process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test',client_email:'test@example.com',private_key:crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');
const {pool}=await import('../src/config/db.js');const {env}=await import('../src/config/env.js');const {mobileAttendanceRouter}=await import('../src/routes/mobileAttendance.js');const {mobileDevicesRouter}=await import('../src/routes/mobileEnrollment.js');
test('start requires assigned coordinator and bound phone; transaction queues only roster users; duplicate start is rejected',async()=>{
 const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',section='00000000-0000-4000-8000-000000000003',period='00000000-0000-4000-8000-000000000004',id='00000000-0000-4000-8000-000000000005',device='device_identifier_123';
 let roles=['student_coordinator'],assigned=true,created=false,capable=true;const calls=[];
 const query=async(sql,args=[])=>{
  calls.push({sql,args});const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
  if(sql.includes('from users u left join user_roles'))return result([{id:uid,roles,role:roles[0]}]);
  if(sql.startsWith('select * from students where user_id=$1'))return result([{id:sid,academic_section_id:section,face_enrolled:true,embedding_model:'mobilefacenet-v1',enrollment_status:'approved',bound_device_id:device}]);
  if(sql.startsWith('select 1 from mobile_fcm_devices'))return result([],capable?1:0);
  if(sql.startsWith('select bound_device_id'))return result([{bound_device_id:device}]);
  if(sql.startsWith('select 1 from student_coordinator_sections'))return result([],assigned?1:0);
  if(sql.startsWith('select t.*,x.section_name'))return result([{id:period,subject_id:period,section_name:'CSE-A'}]);
  if(sql.startsWith('select 1 from attendance_sessions'))return result([],created?1:0);
  if(sql.startsWith('insert into attendance_sessions')){created=true;return result([{id,academic_section_id:section,period,starts_at:new Date(),expires_at:new Date(Date.now()+60000),late_expires_at:new Date(Date.now()+180000),status:'open'}]);}
  if(sql.startsWith('select t.id timetable_id'))return result([{timetable_id:period,section_id:section,session_id:created?id:null}]);
  if(sql.startsWith('select a.id,a.academic_section_id'))return result(created?[{id,section_id:section}]:[]);
  return result([],1);
 };
 const oldQ=pool.query,oldC=pool.connect;pool.query=query;pool.connect=async()=>({query,release(){}});
 const app=express();app.use(express.json());app.use('/attendance',mobileAttendanceRouter);app.use('/devices',mobileDevicesRouter);app.use((e,_q,r,_n)=>r.status(e.status||500).json({message:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,token=jwt.sign({sub:uid},env.jwtSecret,{expiresIn:'1h'});const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const body={section_id:section,timetable_id:period,device_id:device};const post=(path,value)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(value)});
 try{
  let r=await fetch(base+'/attendance/start-options',{headers});assert.equal(r.status,200);assert.equal((await r.json()).periods[0].section_id,section);
  r=await post('/attendance/session/start',{...body,duration_seconds:29});assert.equal(r.status,400);r=await post('/attendance/session/start',{...body,duration_seconds:1801});assert.equal(r.status,400);
  roles=['student'];r=await post('/attendance/session/start',body);assert.equal(r.status,403);roles=['student_coordinator'];
  r=await post('/attendance/session/start',{...body,device_id:'wrong_device_12345'});assert.equal(r.status,403);
  capable=false;r=await post('/attendance/session/start',body);assert.equal(r.status,409);capable=true;
  assigned=false;r=await post('/attendance/session/start',body);assert.equal(r.status,403);assigned=true;
  r=await post('/attendance/session/start',{...body,section_id:period});assert.equal(r.status,403);
  r=await post('/attendance/session/start',{...body,duration_seconds:300});assert.equal(r.status,201);assert.equal((await r.json()).session.id,id);
  const sessionInsert=calls.find(c=>c.sql.startsWith('insert into attendance_sessions'));assert.equal(sessionInsert.args[9],300);assert(sessionInsert.sql.includes('$10::integer'));assert.equal(calls.filter(c=>c.sql.startsWith('insert into ble_tokens')).length,38);
  const roster=calls.find(c=>c.sql.startsWith('insert into session_roster'));assert(roster.sql.includes("enrollment_status='approved'"));assert.equal(roster.args[1],section);
  const enqueue=calls.findIndex(c=>c.sql.startsWith('insert into mobile_push_outbox'));assert(enqueue>0);assert(calls.slice(enqueue).some(c=>c.sql==='commit'));assert.equal(calls[enqueue].args[0],id);assert(calls.some(c=>c.sql.startsWith('insert into broadcasters')&&c.sql.includes('d.can_advertise')));
  r=await post('/attendance/session/start',body);assert.equal(r.status,409);assert.equal(calls.filter(c=>c.sql.startsWith('insert into attendance_sessions')).length,1);
  r=await post('/devices/register-fcm',{device_id:'other_device_12345',fcm_token:'token-with-sufficient-length'});assert.equal(r.status,403);
  r=await post('/devices/register-fcm',{device_id:device,fcm_token:'token-with-sufficient-length',can_advertise:true});assert.equal(r.status,200);assert(calls.some(c=>c.sql.startsWith('insert into mobile_fcm_devices')&&c.args[3]===true));
  r=await post('/devices/unregister-fcm',{device_id:device});assert.equal(r.status,200);assert(calls.some(c=>c.sql==='delete from mobile_fcm_devices where user_id=$1 and device_id=$2'&&c.args[0]===uid));
 }finally{pool.query=oldQ;pool.connect=oldC;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
});
