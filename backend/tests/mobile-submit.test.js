import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';process.env.MOBILE_FACE_THRESHOLD='.8';
process.env.PLAY_INTEGRITY_PACKAGE_NAME='com.gvpcew.attendance';process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER='123456789012';process.env.PLAY_INTEGRITY_CERT_SHA256='certificate';
process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.com',private_key:crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');const {pool}=await import('../src/config/db.js');const {env}=await import('../src/config/env.js');
const {mobileAttendanceRouter}=await import('../src/routes/mobileAttendance.js');const {requestHash}=await import('../src/services/mobileAttendancePolicy.js');const {integrityReady,validIntegrity}=await import('../src/services/mobileIntegrity.js');
const uid='00000000-0000-4000-8000-000000000001',studentId='00000000-0000-4000-8000-000000000002',section='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000004',challengeId='00000000-0000-4000-8000-000000000005',device='device_identifier_123';
const vector=Array.from({length:192},(_,i)=>i===0?1:0);
test('real submit route verifies server match, integrity hash and challenge then writes only own attendance once',async(t)=>{
 let s,a,ch,record,tokenSlot=0,member=true,integrityHash='',integrityAllowed=true,changeSectionOnLock=false,challengeCount=0;const calls=[];
 const reset=()=>{s={id:studentId,user_id:uid,academic_section_id:section,face_enrolled:true,embedding_model:'mobilefacenet-v1',enrollment_status:'approved',bound_device_id:device,face_embedding:[...vector]};a={id,academic_section_id:section,mobile_mode:true,status:'open',starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+60000),late_expires_at:new Date(Date.now()+180000)};ch={id:challengeId,session_id:id,student_id:studentId,device_id:device,challenge_type:'blink',method:'ble',expires_at:new Date(Date.now()+8000),used_at:null};record=null;member=true;tokenSlot=0;integrityAllowed=true;changeSectionOnLock=false;challengeCount=0;};reset();
 const query=async(sql,args=[])=>{calls.push({sql,args});const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
  if(sql.includes('from users u left join user_roles'))return result([{id:uid,roles:['student_coordinator'],role:'student_coordinator'}]);
  if(sql.startsWith('select * from students where user_id'))return result([s]);
  if(sql.startsWith('select * from students where id'))return result([{...s,academic_section_id:changeSectionOnLock?'changed':s.academic_section_id}]);
  if(sql.startsWith('select * from attendance_sessions'))return result([a]);
  if(sql.startsWith('select * from subject_attendance_sessions'))return result([]);
  if(sql.startsWith('select 1 from session_roster'))return result([],member?1:0);
  if(sql.startsWith('select slot from ble_tokens'))return result(args[1]==='a'.repeat(24)?[{slot:tokenSlot}]:[]);
  if(sql.startsWith('select 1 from attendance_records'))return result([],record&&['PRESENT','LATE'].includes(record.status)?1:0);
  if(sql.startsWith('select count(*)::int n from mobile_attendance_challenges'))return result([{n:challengeCount}]);
  if(sql.startsWith('insert into mobile_attendance_challenges')){ch={...ch,challenge_type:args[3],method:args[4]};return result([{id:ch.id,challenge_type:ch.challenge_type,expires_at:ch.expires_at}]);}
  if(sql.startsWith('select * from mobile_attendance_challenges'))return result(args[0]===ch.id?[ch]:[]);
  if(sql.startsWith('select status,method,is_late from attendance_records'))return result(record?[record]:[]);
  if(sql.startsWith('insert into attendance_records')){if(record&&record.status!=='ABSENT')return result([],0);record={status:args[2],method:args[3],is_late:args[7]};return result([{student_id:args[1]}]);}
  if(sql.startsWith('update mobile_attendance_challenges')){ch.used_at=new Date();return result([],1);}
  if(sql.startsWith('select count(*)::int n from attendance_records'))return result([{n:3}]);
  if(['begin','commit','rollback'].includes(sql)||sql.includes('pg_advisory_xact_lock')||sql.startsWith('insert into audit_log'))return result([],1);
  throw new Error('Unexpected query '+sql);
 };
 const oldQ=pool.query,oldC=pool.connect,originalFetch=globalThis.fetch;pool.query=query;pool.connect=async()=>({query,release(){}});
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'mock-oauth',expires_in:3600});
  if(String(url).startsWith('https://playintegrity.googleapis.com/'))return Response.json({tokenPayloadExternal:{requestDetails:{requestPackageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,requestHash:integrityHash,timestampMillis:String(Date.now())},appIntegrity:{packageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,appRecognitionVerdict:'PLAY_RECOGNIZED',certificateSha256Digest:['certificate']},deviceIntegrity:{deviceRecognitionVerdict:integrityAllowed?['MEETS_DEVICE_INTEGRITY']:[]}}});
  return originalFetch(url,options);
 };
 const app=express();app.use(express.json());app.use('/attendance',mobileAttendanceRouter);app.use((e,_q,r,_n)=>r.status(e.status||500).json({message:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/attendance',headers={Authorization:'Bearer '+jwt.sign({sub:uid},env.jwtSecret,{expiresIn:'1h'}),'Content-Type':'application/json'};
 const payload=()=>({student_id:studentId,device_id:device,challenge_id:challengeId,challenge_type:ch.challenge_type,liveness_result:true,embedding_model:'mobilefacenet-v1',embedding:[...vector],ble_token:'a'.repeat(24),timestamp:new Date().toISOString(),integrity_token:'opaque-token'});
 const post=(body,path='/session/'+id+'/submit')=>originalFetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 try {
  assert(integrityReady());let r=await originalFetch(base+'/configuration?device_id='+device,{headers});assert.equal(r.status,200);const config=await r.json();assert.equal(config.student_id,studentId);assert.equal(config.cloud_project_number,'123456789012');assert(!JSON.stringify(config).includes('private_key'));assert.deepEqual(config.own_template,vector);assert.equal(config.similarity_threshold,.8);assert.equal(r.headers.get('cache-control'),'private, no-store');
  r=await post({device_id:device,method:'ble'},'/session/'+id+'/challenge');assert.equal(r.status,400);
  s.academic_section_id='other';r=await post({device_id:device,method:'ble',ble_token:'a'.repeat(24)},'/session/'+id+'/challenge');assert.equal(r.status,403);s.academic_section_id=section;
  r=await post({device_id:device,method:'ble',ble_token:'a'.repeat(24)},'/session/'+id+'/challenge');assert.equal(r.status,201);const challenge=(await r.json()).challenge;assert.equal(challenge.challenge_type,'blink');assert(challenge.valid_for_ms>0&&challenge.valid_for_ms<=8000);
  let body=payload();integrityHash=requestHash(id,body,'ble');r=await post(body);assert.equal(r.status,201);assert.equal((await r.json()).status,'PRESENT');
  const insert=calls.find(c=>c.sql.startsWith('insert into attendance_records'));assert.equal(insert.args[0],id);assert.equal(insert.args[1],studentId);assert.equal(insert.args[4],1);assert.equal(insert.args[6],device);assert(ch.used_at);assert(calls.some(c=>c.sql.includes('for share')));
  r=await originalFetch(base+'/session/'+id+'/my-attendance?device_id='+device,{headers});assert.equal(r.status,200);assert.equal((await r.json()).record.status,'PRESENT');r=await post(body);assert.equal(r.status,403);assert.equal(calls.filter(c=>c.sql.startsWith('insert into attendance_records')).length,1);
  reset();record={status:'PRESENT',method:'ble',is_late:false};body=payload();integrityHash=requestHash(id,body,'ble');r=await post(body);assert.equal(r.status,409);
  const cases=[
   [403,()=>{s.academic_section_id='other';}],
   [403,()=>{member=false;}],
   [403,()=>{s.bound_device_id='other_device_12345';}],
   [403,()=>{s.embedding_model='old-model';}],
   [403,()=>{ch.used_at=new Date();}],
   [403,()=>{ch.expires_at=new Date(Date.now()-1);}],
   [403,()=>{ch.challenge_type='smile';}, {challenge_type:'blink'}],
   [403,()=>{tokenSlot=7;}],
   [403,()=>{integrityAllowed=false;}],
   [403,()=>{changeSectionOnLock=true;}],
   [409,()=>{a.status='closed';}],
   [422,()=>{}, {embedding:Array.from({length:192},(_,i)=>i===1?1:0)}],
   [403,()=>{}, {student_id:uid}],
   [400,()=>{}, {matched:true}],
   [400,()=>{}, {liveness_result:false}],
   [400,()=>{}, {ble_token:undefined}],
   [400,()=>{}, {timestamp:new Date(Date.now()-30000).toISOString()}],
  ];
  for(const [status,mutate,patch] of cases){reset();body={...payload(),...patch};mutate();integrityHash=requestHash(id,body,'ble');r=await post(body);assert.equal(r.status,status,JSON.stringify(patch||{})+' '+await r.text());assert.equal(record,null);}
  reset();body=payload();integrityHash=requestHash(id,body,'ble');body.embedding[1]=.1;r=await post(body);assert.equal(r.status,403);assert.equal(record,null);
  r=await originalFetch(base+'/session/'+id+'/my-attendance?device_id=other_device_12345',{headers});assert.equal(r.status,403);

  await t.test('only three blink challenges, and blink with mismatched face consumes the challenge without attendance',async()=>{
   reset();challengeCount=3;let r=await post({device_id:device,method:'ble',ble_token:'a'.repeat(24)},'/session/'+id+'/challenge');assert.equal(r.status,429);
   reset();let body={...payload(),embedding:Array.from({length:192},(_,i)=>i===1?1:0)};integrityHash=requestHash(id,body,'ble');r=await post(body);assert.equal(r.status,422);assert.equal((await r.json()).message,'Face not recognized, try again');assert(ch.used_at);assert.equal(record,null);
   body=payload();integrityHash=requestHash(id,body,'ble');r=await post(body);assert.equal(r.status,403);assert.equal(record,null);
   reset();body={...payload(),challenge_type:'smile'};r=await post(body);assert.equal(r.status,400);assert.equal(record,null);
  });
  await t.test('late check-in replaces ABSENT with LATE, omits BLE checks and records review and repeated-fallback audits',async()=>{
   reset();a.status='closed';a.expires_at=new Date(Date.now()-1000);ch.method='fallback';record={status:'ABSENT',method:null,is_late:false};
   const start=calls.length;let r=await post({device_id:device,method:'fallback'},'/session/'+id+'/challenge');assert.equal(r.status,201);
   let body=payload();delete body.ble_token;integrityHash=requestHash(id,body,'fallback');r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,201);const response=await r.json();assert.equal(response.status,'LATE');assert.equal(response.method,'fallback');assert.equal(response.is_late,true);assert.equal(response.similarity,1);
   assert.deepEqual(record,{status:'LATE',method:'fallback',is_late:true});assert(!calls.slice(start).some(c=>c.sql.includes('from ble_tokens')));assert(calls.slice(start).some(c=>c.sql.startsWith('select count(*)::int n from mobile_attendance_challenges')&&c.args[2]==='fallback'));
   const audits=calls.slice(start).filter(c=>c.sql.startsWith('insert into audit_log')).map(c=>c.args[0]);assert(audits.includes('late_checkin_review'));assert(audits.includes('frequent_fallback'));assert(calls.slice(start).some(c=>c.sql.includes('for no key update')));
   r=await post({device_id:device,method:'fallback'},'/session/'+id+'/challenge');assert.equal(r.status,409);r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,403);assert.equal(calls.slice(start).filter(c=>c.sql.startsWith('insert into attendance_records')).length,1);
  });
  await t.test('fallback is unavailable during the main window and after its two-minute expiry',async()=>{
   reset();ch.method='fallback';let body=payload();delete body.ble_token;integrityHash=requestHash(id,body,'fallback');let r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,409);
   a.status='closed';a.expires_at=new Date(Date.now()-121000);a.late_expires_at=new Date(Date.now()-1);r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,409);r=await post({device_id:device,method:'fallback'},'/session/'+id+'/challenge');assert.equal(r.status,409);assert.equal(record,null);
  });
  await t.test('fallback rejects a supplied BLE token and an integrity hash from the main method',async()=>{
   reset();a.status='closed';a.expires_at=new Date(Date.now()-1000);ch.method='fallback';let body=payload();let r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,400);
   r=await post({device_id:device,method:'fallback',ble_token:body.ble_token},'/session/'+id+'/challenge');assert.equal(r.status,400);
   delete body.ble_token;integrityHash=requestHash(id,body,'ble');r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,403);assert.equal(record,null);
  });
  await t.test('an accepted main attendance cannot be overwritten by a late attempt',async()=>{
   reset();a.status='closed';a.expires_at=new Date(Date.now()-1000);ch.method='fallback';record={status:'PRESENT',method:'ble',is_late:false};let body=payload();delete body.ble_token;integrityHash=requestHash(id,body,'fallback');let r=await post(body,'/session/'+id+'/late-checkin');assert.equal(r.status,409);assert.equal(record.status,'PRESENT');
  });
 }finally{globalThis.fetch=originalFetch;pool.query=oldQ;pool.connect=oldC;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
});
test('integrity configuration and malformed decoded verdicts fail closed',()=>{
 const saved=process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;delete process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER;assert(!integrityReady());process.env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER=saved;
 assert(!validIntegrity(null,'hash'));assert(!validIntegrity({requestDetails:{requestPackageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,requestHash:'hash',timestampMillis:String(Date.now())},appIntegrity:{packageName:process.env.PLAY_INTEGRITY_PACKAGE_NAME,appRecognitionVerdict:'PLAY_RECOGNIZED',certificateSha256Digest:'certificate'},deviceIntegrity:{deviceRecognitionVerdict:'MEETS_DEVICE_INTEGRITY'}},'hash'));
});
