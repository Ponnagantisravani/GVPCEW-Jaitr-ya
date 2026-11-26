import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1:5432/test';
process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
const {pool}=await import('../src/config/db.js');
const {env}=await import('../src/config/env.js');
const {createApp}=await import('../src/app.js');

test('HOD endpoints require HOD role and faculty preference payload requires 3–4 distinct ranks',async t=>{
 const query=pool.query,connect=pool.connect;let roles=['student'];
 pool.query=async(sql,values)=>{
  if(sql.includes('preference_sheet_recipients'))return {rows:[{}],rowCount:1};
  if(sql.includes('from users u left join user_roles'))return {rows:[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',full_name:'Test account',email:'test@example.invalid',role:'faculty',roles}]};
  if(sql.includes('select id,department_id from faculty where user_id=$1'))return {rows:[{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',department_id:'cccccccc-cccc-cccc-cccc-cccccccccccc'}]};
  if(sql.includes('select p.*,s.department_id from preference_sheets'))return {rows:[{id:'dddddddd-dddd-dddd-dddd-dddddddddddd',status:'published',deadline:new Date(Date.now()+3600000),department_id:'cccccccc-cccc-cccc-cccc-cccccccccccc'}]};
  if(sql.includes('from preference_sheet_subjects'))return {rows:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'].map(id=>({id,type:'theory'}))};
  return {rows:[],rowCount:0};
 };
 const tx={query:async(sql)=>{
  if(sql.includes('preference_sheet_recipients'))return {rows:[{}],rowCount:1};
  if(sql.includes('select p.*,s.department_id from preference_sheets'))return {rows:[{id:'dddddddd-dddd-dddd-dddd-dddddddddddd',status:'published',deadline:new Date(Date.now()+3600000),department_id:'cccccccc-cccc-cccc-cccc-cccccccccccc'}],rowCount:1};
  if(sql.includes('from preference_sheet_subjects'))return {rows:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'].map(id=>({id,type:'theory'})),rowCount:3};
  if(sql.startsWith('insert into faculty_preferences'))return {rows:[],rowCount:1};
  return {rows:[],rowCount:0};
 },release(){}};pool.connect=async()=>tx;
 const server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));pool.query=query;pool.connect=connect;await pool.end();});
 const token=jwt.sign({sub:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},env.jwtSecret,{expiresIn:'5m'}),base=`http://127.0.0.1:${server.address().port}/api`;
 const call=(path,role,body)=>fetch(base+path,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'X-Portal-Role':role,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await call('/hod/faculty/preferences/dddddddd-dddd-dddd-dddd-dddddddddddd','student',{rankedSubjectIds:[]})).status,403);
 roles=['faculty'];
 assert.equal((await call('/hod/faculty/preferences/dddddddd-dddd-dddd-dddd-dddddddddddd','faculty',{rankedSubjectIds:['11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333']})).status,400);
 assert.equal((await call('/hod/faculty/preferences/dddddddd-dddd-dddd-dddd-dddddddddddd','faculty',{rankedSubjectIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']})).status,400);
 const accepted=await call('/hod/faculty/preferences/dddddddd-dddd-dddd-dddd-dddddddddddd','faculty',{rankedSubjectIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333']});assert.equal(accepted.status,200,await accepted.text());
});
