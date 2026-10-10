import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
const {fcmReady,messageFor,sendFcm}=await import('../src/services/mobileFcm.js');
const {drainPushQueue}=await import('../src/services/mobilePushQueue.js');
test('push TTL expires with the session and payload has no BLE token or biometric data',()=>{
 const now=Date.now(),row={fcm_token:'private-device-token',session_id:'session',academic_section_id:'section',user_id:'user',expires_at:new Date(now+60000),broadcast:true};
 const m=messageFor(row,now+10000);assert.equal(m.android.ttl,'50s');assert.equal(m.data.broadcast,'true');assert.deepEqual(Object.keys(m.data).sort(),['broadcast','expires_at','section_id','session_id','type','user_id']);assert.equal(messageFor(row,now+60000),null);
});
test('FCM HTTP v1 uses server OAuth, rejects bad configuration, and identifies stale tokens and transient failure',async()=>{
 assert.equal(fcmReady(),false);
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 process.env.FCM_PROJECT_ID='test-campus';process.env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({project_id:'test-campus',client_email:'test@test-campus.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})});
 assert.equal(fcmReady(),true);let sends=0,oauth=0;const original=global.fetch;
 global.fetch=async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token'){oauth++;const payload=JSON.parse(Buffer.from(options.body.get('assertion').split('.')[1],'base64url'));assert.equal(payload.scope,'https://www.googleapis.com/auth/firebase.messaging');return new Response(JSON.stringify({access_token:'server-oauth',expires_in:3600}));}
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/test-campus/messages:send');assert.equal(options.headers.Authorization,'Bearer server-oauth');assert.equal(JSON.parse(options.body).message.token,'token');sends++;
  return sends===1?new Response('{}'):sends===2?new Response(JSON.stringify({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}}),{status:404}):new Response('{}',{status:429});
 };
 try{assert((await sendFcm({token:'token'})).sent);assert((await sendFcm({token:'token'})).invalidToken);assert((await sendFcm({token:'token'})).retry);assert.equal(oauth,1);}finally{global.fetch=original;delete process.env.FCM_PROJECT_ID;delete process.env.FCM_SERVICE_ACCOUNT_JSON;}
});
test('queue skips ineligible recipients, removes only the stale token, and retries transient errors',async()=>{
 const changes=[],now=new Date(Date.now()+60000);const rows=[1,2,3,4].map(id=>({id,session_id:'s',student_id:String(id),attempts:1}));
 const db={query:async(sql,args=[])=>{
  if(sql.startsWith('with due'))return {rows};
  if(sql.startsWith('select a.id')){assert(sql.includes('s.academic_section_id=a.academic_section_id'));assert(sql.includes('d.device_id=s.bound_device_id'));return {rows:args[1]==='1'?[]:[{session_id:'s',academic_section_id:'section',user_id:'u'+args[1],fcm_token:'t'+args[1],expires_at:now,broadcast:false}]};}
  changes.push({sql,args});return {rows:[],rowCount:1};
 }};
 const sent=[];await drainPushQueue(db,async(message)=>{sent.push(message.token);return message.token==='t2'?{sent:false,invalidToken:true,error:'UNREGISTERED'}:message.token==='t3'?{sent:false,retry:true,error:'503'}:{sent:true};});
 assert.deepEqual(sent.sort(),['t2','t3','t4']);assert(changes.some(c=>c.sql.includes("state='expired'")&&c.args[0]===1));assert(changes.some(c=>c.sql.startsWith('delete from mobile_fcm_devices')&&c.args.join(',')==='u2,t2'));assert(changes.some(c=>c.args[0]===3&&c.args[1]==='pending'));assert(changes.some(c=>c.args[0]===4&&c.args[1]==='sent'));
});
