import {z} from 'zod';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {MODEL,deviceSchema,embeddingSchema} from '../services/mobileAttendancePolicy.js';
export const mobileEnrollmentRouter=Router();
mobileEnrollmentRouter.use(requireAuth);
const students=allowRoles('student','student_coordinator');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const parse=(schema,body)=>{const p=schema.safeParse(body);if(!p.success)fail(400,'Invalid setup payload.');return p.data;};
async function tx(fn){const c=await pool.connect();try{await c.query('begin');const r=await fn(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
async function audit(c,event,user,id,details={}){await c.query('insert into audit_log(event,actor_id,details) values($1,$2,$3)',[event,user,JSON.stringify({student_id:id,...details})]);}
mobileEnrollmentRouter.get('/status',students,async(req,res)=>{
 const s=(await pool.query('select id,embedding_model,face_enrolled,enrollment_status,bound_device_id,mobile_consent_at,mobile_password_changed_at from students where user_id=$1',[req.user.sub])).rows[0];if(!s)fail(403,'Student account required.');
 res.json({student_id:s.id,embedding_model:s.embedding_model,enrollment_status:s.enrollment_status,setup_required:!s.face_enrolled||s.embedding_model!==MODEL||!s.mobile_consent_at||!s.mobile_password_changed_at,approved:s.enrollment_status==='approved',bound_device_id:s.bound_device_id});
});
mobileEnrollmentRouter.post('/setup',students,async(req,res)=>{
 const p=parse(z.object({current_password:z.string().min(1).max(128),new_password:z.string().min(12).max(128),consent:z.literal(true),device_id:deviceSchema,embedding_model:z.literal(MODEL),model_sha256:z.literal('be4bc7cfc53f7bc336d0f28b1ab92535f618c913a422b683210750f6b5354854'),embedding:embeddingSchema,sample_count:z.number().int().min(3).max(5),preview:z.string().max(140000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/)}).strict(),req.body);
 if(p.current_password===p.new_password)fail(400,'Choose a new password.');
 const image=Buffer.from(p.preview.split(',')[1],'base64');if(image.length>100000)fail(413,'Preview must be under 100 KB.');
 let preview;try{preview=await sharp(image,{limitInputPixels:1000000}).resize(240,240,{fit:'inside',withoutEnlargement:true}).jpeg({quality:65}).toBuffer();}catch{fail(400,'Invalid JPEG preview.');}
 const result=await tx(async c=>{
 await c.query('select pg_advisory_xact_lock(hashtext($1))',['mobile-device:'+p.device_id]);
 const s=(await c.query('select s.*,u.password_hash from students s join users u on u.id=s.user_id where s.user_id=$1 for update of s,u',[req.user.sub])).rows[0];if(!s)fail(403,'Student account required.');
 if(s.face_enrolled||s.bound_device_id||s.enrollment_status!=='required')fail(409,'Only an administrator can reset enrollment.');
 if(!await bcrypt.compare(p.current_password,s.password_hash))fail(403,'Current password is incorrect.');
 if((await c.query('select 1 from students where bound_device_id=$1 and id<>$2',[p.device_id,s.id])).rowCount)fail(409,'This device is bound to another account.');
 await c.query('update users set password_hash=$1 where id=$2',[await bcrypt.hash(p.new_password,12),req.user.sub]);
 await c.query("update students set face_embedding=$2,embedding_model=$3,face_enrolled=true,enrollment_status='pending',bound_device_id=$4,mobile_consent_at=now(),mobile_password_changed_at=now(),enrollment_preview=$5,enrollment_preview_expires_at=now()+interval '7 days' where id=$1",[s.id,p.embedding,MODEL,p.device_id,preview]);
 await audit(c,'mobile_enrollment_pending',req.user.sub,s.id,{sample_count:p.sample_count,consent_version:'mobile-attendance-v1'});
 return {student_id:s.id,enrollment_status:'pending'};
 }).catch(async e=>{if(e.status===409)await audit(pool,'enrollment_or_device_reuse_rejected',req.user.sub,null);throw e;});res.status(201).json(result);
});
mobileEnrollmentRouter.get('/pending',allowRoles('admin'),async(_req,res)=>{
 const rows=(await pool.query("select s.id,s.roll_number,u.full_name,s.enrollment_preview_expires_at from students s join users u on u.id=s.user_id where s.enrollment_status='pending' order by s.mobile_consent_at")).rows;res.json({students:rows});
});
mobileEnrollmentRouter.get('/:id/preview',allowRoles('admin'),async(req,res)=>{
 if(!z.string().uuid().safeParse(req.params.id).success)fail(400,'Invalid student id.');
 const s=(await pool.query("select enrollment_preview from students where id=$1 and enrollment_status='pending' and enrollment_preview_expires_at>now()",[req.params.id])).rows[0];if(!s?.enrollment_preview)fail(404,'Preview unavailable or expired.');res.type('jpeg').send(s.enrollment_preview);
});
mobileEnrollmentRouter.post('/:id/review',allowRoles('admin'),async(req,res)=>{
 if(!z.string().uuid().safeParse(req.params.id).success)fail(400,'Invalid student id.');const p=parse(z.object({approve:z.boolean()}).strict(),req.body);
 await tx(async c=>{const r=await c.query("update students set enrollment_status=$2,enrollment_preview=null,enrollment_preview_expires_at=null where id=$1 and enrollment_status='pending' and embedding_model=$3 and face_enrolled and mobile_consent_at is not null returning id",[req.params.id,p.approve?'approved':'rejected',MODEL]);if(!r.rowCount)fail(409,'Enrollment is not pending.');await audit(c,p.approve?'mobile_enrollment_approved':'mobile_enrollment_rejected',req.user.sub,req.params.id);});res.json({enrollment_status:p.approve?'approved':'rejected'});
});
mobileEnrollmentRouter.post('/:id/reset',allowRoles('admin'),async(req,res)=>{
 if(!z.string().uuid().safeParse(req.params.id).success)fail(400,'Invalid student id.');const p=parse(z.object({reason:z.string().min(10).max(500)}).strict(),req.body);
 await tx(async c=>{const r=await c.query("update students set face_embedding=null,embedding_model='legacy-unknown',face_enrolled=false,enrollment_status='required',bound_device_id=null,mobile_consent_at=null,mobile_password_changed_at=null,enrollment_preview=null,enrollment_preview_expires_at=null where id=$1 returning user_id",[req.params.id]);if(!r.rowCount)fail(404,'Student not found.');await c.query('delete from mobile_fcm_devices where user_id=$1',[r.rows[0].user_id]);await audit(c,'mobile_enrollment_reset',req.user.sub,req.params.id,{reason:p.reason});const n=(await c.query("select count(*)::int n from audit_log where event='mobile_enrollment_reset' and details->>'student_id'=$1 and created_at>now()-interval '30 days'",[req.params.id])).rows[0].n;if(n>=3)await audit(c,'repeated_device_changes',req.user.sub,req.params.id,{count:n});});res.json({enrollment_status:'required'});
});
export const mobileDevicesRouter=Router();
mobileDevicesRouter.use(requireAuth,students);
mobileDevicesRouter.post('/register-fcm',async(req,res)=>{
 const p=parse(z.object({device_id:deviceSchema,fcm_token:z.string().min(20).max(4096),can_advertise:z.boolean().optional().default(false)}).strict(),req.body);
 const s=(await pool.query('select bound_device_id from students where user_id=$1',[req.user.sub])).rows[0];if(s?.bound_device_id!==p.device_id)fail(403,'Use the enrolled device.');
 await pool.query('insert into mobile_fcm_devices(user_id,device_id,fcm_token,can_advertise) values($1,$2,$3,$4) on conflict(user_id) do update set device_id=excluded.device_id,fcm_token=excluded.fcm_token,can_advertise=excluded.can_advertise,updated_at=now()',[req.user.sub,p.device_id,p.fcm_token,p.can_advertise]);res.json({registered:true});
});

mobileDevicesRouter.post('/unregister-fcm',async(req,res)=>{
 const p=parse(z.object({device_id:deviceSchema}).strict(),req.body);
 await pool.query('delete from mobile_fcm_devices where user_id=$1 and device_id=$2',[req.user.sub,p.device_id]);res.json({registered:false});
});
