import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
const {default:express}=await import('express');const {default:jwt}=await import('jsonwebtoken');const {default:bcrypt}=await import('bcryptjs');
const {pool}=await import('../src/config/db.js');const {env}=await import('../src/config/env.js');const {authRouter}=await import('../src/routes/auth.js');const {mobileEnrollmentRouter}=await import('../src/routes/mobileEnrollment.js');
test('mobile login reuses JWT auth and one-time enrollment enforces numeric-only template, device and self ownership',async()=>{
 const uid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',hash=await bcrypt.hash('assigned-password',4);
 const state={id:sid,user_id:uid,password_hash:hash,face_enrolled:false,bound_device_id:null,enrollment_status:'required',roll_number:'TEST-ROLL'};
 let roles=['student'],reused=false;const updates=[];
 const query=async(sql,args=[])=>{
  if(sql.includes('u.password_hash')&&sql.includes('group by'))return {rows:[{id:uid,full_name:'Student',role:'student',password_hash:hash,face_enrollment_status:'pending',roles}],rowCount:1};
  if(sql.includes('from users u left join user_roles'))return {rows:[{id:uid,role:roles[0],roles}],rowCount:1};
  if(sql.includes('select id from students where user_id'))return {rows:[{id:sid}],rowCount:1};
  if(sql.includes('select * from students where user_id')||sql.includes('select id,roll_number,embedding_model'))return {rows:[state],rowCount:1};
  if(sql.includes('select 1 from students where bound_device_id'))return {rows:[],rowCount:reused?1:0};
  if(sql.startsWith('update users')){updates.push({sql,args});return {rows:[],rowCount:1};}
  if(sql.startsWith('update students set face_embedding')&&sql.includes('face_enrolled=false')){updates.push({sql,args});Object.assign(state,{face_enrolled:false,enrolled_at:null,bound_device_id:null,enrollment_status:'required'});return {rows:[{user_id:uid}],rowCount:1};}
  if(sql.startsWith('delete from mobile_fcm_devices'))return {rows:[],rowCount:1};
  if(sql.startsWith('select count(*)::int n from audit_log'))return {rows:[{n:1}],rowCount:1};
  if(sql.startsWith('update students set face_embedding')){updates.push({sql,args});state.face_enrolled=true;state.bound_device_id=args[3];state.enrollment_status='approved';state.enrolled_at=new Date().toISOString();return {rows:[],rowCount:1};}
  if(['begin','commit','rollback'].includes(sql)||sql.includes('pg_advisory_xact_lock')||sql.includes('insert into audit_log'))return {rows:[],rowCount:1};
  throw new Error('Unexpected query '+sql);
 };
 const originalQuery=pool.query,originalConnect=pool.connect;pool.query=query;pool.connect=async()=>({query,release(){}});
 const app=express();app.use(express.json());app.use('/auth',authRouter);app.use('/enrollment',mobileEnrollmentRouter);app.use((e,_q,r,_n)=>r.status(e.status||500).json({message:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const token=jwt.sign({sub:uid},env.jwtSecret,{expiresIn:'1h'});const post=(route,body,auth=true)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 const body={consent:true,device_id:'device_identifier_123',embedding_model:'mobilefacenet-v1',model_sha256:'be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854',embedding:Array.from({length:192},(_,i)=>i===0?1:0),sample_count:5};
 try {
  let r=await post('/auth/login',{email:'student@campus.example',password:'wrong-password'},false);assert.equal(r.status,401);
  r=await post('/auth/login',{email:'student@campus.example',password:'assigned-password'},false);assert.equal(r.status,200);assert.equal((await r.json()).user.roles[0],'student');assert.equal(state.face_enrolled,false);
  roles=[];r=await post('/auth/login',{email:'student@campus.example',password:'assigned-password'},false);assert.equal(r.status,403);assert((await r.json()).enrollmentToken);roles=['student'];
  r=await post('/auth/login',{email:'student@campus.example',password:'assigned-password',client:'mobile'},false);assert.equal(r.status,200);const data=await r.json();assert.equal(jwt.verify(data.token,env.jwtSecret).sub,uid);
  r=await post('/enrollment/setup',{...body,model_sha256:'wrong'});assert.equal(r.status,400);
  r=await post('/enrollment/setup',{...body,consent:false});assert.equal(r.status,400);
  r=await post('/enrollment/setup',{...body,student_id:sid});assert.equal(r.status,400);
  r=await post('/enrollment/setup',{...body,preview:'data:image/jpeg;base64,photo'});assert.equal(r.status,400);
  r=await post('/enrollment/setup',{...body,current_password:'assigned-password'});assert.equal(r.status,400);
  reused=true;r=await post('/enrollment/setup',body);assert.equal(r.status,409);reused=false;
  roles=['admin'];r=await post('/enrollment/setup',body);assert.equal(r.status,403);roles=['student'];
  r=await post('/enrollment/setup',body);assert.equal(r.status,201);const saved=await r.json();assert.equal(saved.enrollment_status,'approved');assert.equal(saved.roll_number,'TEST-ROLL');assert.equal(saved.face_enrolled,true);
  assert.equal(updates.length,1);assert.deepEqual(updates[0].args[1],body.embedding);assert.equal(updates[0].args.length,4);assert(updates[0].sql.includes('enrolled_at=clock_timestamp()'));
  const status=await fetch(base+'/enrollment/status',{headers:{Authorization:'Bearer '+token}});assert.equal(status.status,200);assert.equal((await status.json()).face_enrolled,true);
  r=await post('/enrollment/setup',body);assert.equal(r.status,409);assert.equal(updates.length,1);
  r=await post('/enrollment/'+sid+'/reset',{reason:'Requested enrolled phone reset'});assert.equal(r.status,403);
  roles=['admin'];r=await post('/enrollment/'+sid+'/reset',{reason:'Requested enrolled phone reset'});assert.equal(r.status,200);assert.equal(state.face_enrolled,false);assert.equal(state.enrolled_at,null);assert(updates[1].sql.includes('enrolled_at=null'));
  roles=['student'];r=await post('/enrollment/setup',body);assert.equal(r.status,201);assert.equal(state.face_enrolled,true);assert.equal(updates.length,3);
 } finally {pool.query=originalQuery;pool.connect=originalConnect;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}
});
