import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');const {pool}=await import('../src/config/db.js');const {env}=await import('../src/config/env.js');const {mobileAttendanceRouter}=await import('../src/routes/mobileAttendance.js');
test('BLE validation gates roster, section, device and current/previous token without exposing tokens to students',async()=>{
 const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',section='00000000-0000-4000-8000-000000000004',device='device_identifier_123',token='a'.repeat(24);
 const start=Date.now()-9000,a={id,academic_section_id:section,coordinator_user_id:'other',starts_at:new Date(start),expires_at:new Date(start+60000),status:'open'},s={id:sid,user_id:uid,academic_section_id:section,face_enrolled:true,embedding_model:'mobilefacenet-v1',enrollment_status:'approved',bound_device_id:device};
 let member=true,broadcaster=false,slot=1;
 const query=async(sql,args=[])=>{
  if(sql.includes('from users u left join user_roles'))return {rows:[{id:uid,roles:['student'],role:'student'}],rowCount:1};
  if(sql==='select * from students where user_id=$1')return {rows:[s],rowCount:1};
  if(sql.startsWith('select * from attendance_sessions'))return {rows:[a],rowCount:1};
  if(sql.startsWith('select 1 from session_roster'))return {rows:[],rowCount:member?1:0};
  if(sql.startsWith('select 1 from broadcasters'))return {rows:[],rowCount:broadcaster?1:0};
  if(sql.startsWith('select slot from ble_tokens'))return {rows:args[1]===token?[{slot}]:[],rowCount:args[1]===token?1:0};
  if(sql.startsWith('select valid_to from ble_tokens'))return {rows:[{valid_to:new Date(start+(slot+1)*8000)}],rowCount:1};
  if(sql.startsWith('select token,valid_from,valid_to'))return {rows:[{token,valid_from:new Date(start+8000),valid_to:new Date(start+16000)}],rowCount:1};
  throw new Error('Unexpected SQL '+sql);
 };
 const old=pool.query;pool.query=query;const app=express();app.use(express.json());app.use('/attendance',mobileAttendanceRouter);app.use((e,_q,r,_n)=>r.status(e.status||500).json({message:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+jwt.sign({sub:uid},env.jwtSecret,{expiresIn:'1h'}),'Content-Type':'application/json'};
 const check=(body={device_id:device,ble_token:token})=>fetch(base+'/attendance/session/'+id+'/token/validate',{method:'POST',headers,body:JSON.stringify(body)});
 try{
  let r=await check();assert.equal(r.status,200);const data=await r.json();assert.equal(data.accepted,true);assert(data.valid_for_ms>0&&data.valid_for_ms<16000);assert(!('token' in data));
  slot=0;r=await check();assert.equal(r.status,200);slot=7;r=await check();assert.equal(r.status,403);slot=1;
  r=await check({device_id:device,ble_token:'b'.repeat(24)});assert.equal(r.status,403);
  r=await check({device_id:'other_device_12345',ble_token:token});assert.equal(r.status,403);
  member=false;r=await check();assert.equal(r.status,403);member=true;
  s.academic_section_id='other-section';r=await check();assert.equal(r.status,403);s.academic_section_id=section;
  s.enrollment_status='pending';r=await check();assert.equal(r.status,403);s.enrollment_status='approved';
  r=await fetch(base+'/attendance/session/'+id+'/token?device_id='+device,{headers});assert.equal(r.status,403);
  broadcaster=true;r=await fetch(base+'/attendance/session/'+id+'/token?device_id='+device,{headers});assert.equal(r.status,200);assert.equal((await r.json()).token,token);
  r=await fetch(base+'/attendance/session/'+id+'/token?device_id=other_device_12345',{headers});assert.equal(r.status,403);
  a.status='closed';r=await check();assert.equal(r.status,409);
 }finally{pool.query=old;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
});
