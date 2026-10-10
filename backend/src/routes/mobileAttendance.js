import crypto from 'node:crypto';
import {z} from 'zod';
import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {MODEL,deviceSchema,submissionSchema,cosineSimilarity,requestHash,tokenSlot,tokenAccepted,windowOpen,threshold} from '../services/mobileAttendancePolicy.js';
import {integrityReady,integrityProjectNumber,verifyIntegrity} from '../services/mobileIntegrity.js';
import {fcmReady} from '../services/mobileFcm.js';
import {enqueueSessionPushes} from '../services/mobilePushQueue.js';
export const mobileAttendanceRouter=Router();
mobileAttendanceRouter.use(requireAuth);
const students=allowRoles('student','student_coordinator');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const parse=(schema,body)=>{const p=schema.safeParse(body);if(!p.success)fail(400,'Invalid attendance payload.');return p.data;};
async function transaction(fn){const c=await pool.connect();try{await c.query('begin');const r=await fn(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
async function student(c,user){const s=(await c.query('select * from students where user_id=$1',[user])).rows[0];if(!s)fail(403,'Student account required.');return s;}
async function audit(c,event,user,id,details={}){await c.query('insert into audit_log(event,actor_id,session_id,details) values($1,$2,$3,$4)',[event,user,id,JSON.stringify(details)]);}
async function session(c,id,lock=false){if(!z.string().uuid().safeParse(id).success)fail(400,'Invalid session id.');const a=(await c.query('select * from attendance_sessions where id=$1 and mobile_mode'+(lock?' for share':''),[id])).rows[0];if(!a)fail(404,'Session not found.');return a;}
async function member(c,id,s){if(!(await c.query('select 1 from session_roster where session_id=$1 and student_id=$2',[id,s.id])).rowCount)fail(403,'You are not on this session roster.');}
function enrolled(s,device){if(!s||!s.face_enrolled||s.embedding_model!==MODEL||s.enrollment_status!=='approved'||!s.bound_device_id||(device&&s.bound_device_id!==device))fail(403,'Approved MobileFaceNet enrollment on your bound device is required.');}
async function canRead(a,user,includeStudents=true){
 if(user.roles.includes('admin'))return true;
 if(includeStudents&&(await pool.query('select 1 from students where user_id=$1 and academic_section_id=$2',[user.sub,a.academic_section_id])).rowCount)return true;
 if(user.roles.includes('faculty')&&(await pool.query('select 1 from faculty where user_id=$1 and id=$2',[user.sub,a.faculty_id])).rowCount)return true;
 return user.roles.includes('academic_coordinator')&&(await pool.query('select 1 from academic_sections s where s.id=$2 and (exists(select 1 from academic_coordinator_departments d where d.user_id=$1 and d.department_id=s.department_id) or exists(select 1 from academic_institution_access i where i.user_id=$1))',[user.sub,a.academic_section_id])).rowCount>0;
}
async function checkToken(c,a,token){const t=(await c.query('select slot from ble_tokens where session_id=$1 and token=$2',[a.id,token])).rows[0];if(!t||!tokenAccepted(t.slot,tokenSlot(a.starts_at,Date.now())))fail(403,'Bluetooth token expired or invalid.');}
function ownSection(a,s){if(!s.academic_section_id||s.academic_section_id!==a.academic_section_id)fail(403,'Section access required.');}
mobileAttendanceRouter.get('/configuration',students,async(req,res)=>{
 const device=parse(z.object({device_id:deviceSchema}).strict(),req.query).device_id;
 const s=await student(pool,req.user.sub);enrolled(s,device);threshold();
 if(!integrityReady())fail(503,'Configure Play Integrity before mobile attendance.');
 res.json({student_id:s.id,embedding_model:MODEL,package_name:process.env.PLAY_INTEGRITY_PACKAGE_NAME,cloud_project_number:integrityProjectNumber()});
});
mobileAttendanceRouter.get('/session/:id/my-attendance',students,async(req,res)=>{
 const device=parse(z.object({device_id:deviceSchema}).strict(),req.query).device_id;
 const a=await session(pool,req.params.id),s=await student(pool,req.user.sub);enrolled(s,device);ownSection(a,s);await member(pool,a.id,s);
 const r=(await pool.query('select status,method,is_late from attendance_records where session_id=$1 and student_id=$2',[a.id,s.id])).rows[0];
 res.json({record:r||null});
});
mobileAttendanceRouter.get('/start-options',allowRoles('student_coordinator'),async(req,res)=>{
 const s=await student(pool,req.user.sub);
 const periods=(await pool.query("select t.id timetable_id,t.academic_section_id section_id,x.section_name,t.start_time,t.end_time,su.name subject_name,a.id session_id,a.expires_at from timetable t join academic_sections x on x.id=t.academic_section_id join subjects su on su.id=t.subject_id join student_coordinator_sections cs on cs.academic_section_id=t.academic_section_id and cs.user_id=$1 left join attendance_sessions a on a.mobile_mode and a.academic_section_id=t.academic_section_id and a.period=t.id::text and (a.starts_at at time zone 'Asia/Kolkata')::date=(clock_timestamp() at time zone 'Asia/Kolkata')::date where t.academic_section_id=$2 and t.status='published' and t.entry_type in ('class','lab') and t.day_of_week=extract(dow from clock_timestamp() at time zone 'Asia/Kolkata') and (clock_timestamp() at time zone 'Asia/Kolkata')::time>=t.start_time and (clock_timestamp() at time zone 'Asia/Kolkata')::time<t.end_time order by t.start_time",[req.user.sub,s.academic_section_id])).rows;
 res.json({periods});
});
mobileAttendanceRouter.get('/active',students,async(req,res)=>{
 const s=await student(pool,req.user.sub);
 const a=(await pool.query("select a.id,a.academic_section_id section_id,a.period,a.starts_at started_at,a.expires_at,a.status,(a.coordinator_user_id=$1 or exists(select 1 from broadcasters b where b.session_id=a.id and b.student_id=$2)) broadcast from attendance_sessions a join session_roster r on r.session_id=a.id and r.student_id=$2 where a.mobile_mode and a.academic_section_id=$3 and a.status='open' and a.expires_at>clock_timestamp() order by a.starts_at desc limit 1",[req.user.sub,s.id,s.academic_section_id])).rows[0];
 res.json({session:a||null});
});
mobileAttendanceRouter.post('/session/start',allowRoles('student_coordinator'),async(req,res)=>{
 threshold();if(!integrityReady())fail(503,'Configure Play Integrity before starting mobile attendance.');
 if(!fcmReady())fail(503,'Configure Firebase messaging before starting mobile attendance.');
 const p=parse(z.object({section_id:z.string().uuid(),timetable_id:z.string().uuid(),device_id:deviceSchema}).strict(),req.body);
 const result=await transaction(async c=>{
 const s=await student(c,req.user.sub);enrolled(s,p.device_id);
 if(!(await c.query('select 1 from mobile_fcm_devices where user_id=$1 and device_id=$2 and can_advertise',[req.user.sub,p.device_id])).rowCount)fail(409,'Register notifications on a phone that supports Bluetooth broadcasting before starting.');
 if(s.academic_section_id!==p.section_id||!(await c.query('select 1 from student_coordinator_sections where user_id=$1 and academic_section_id=$2',[req.user.sub,p.section_id])).rowCount)fail(403,'Coordinator assignment to your own section is required.');
 await c.query('select pg_advisory_xact_lock(hashtext($1))',['mobile-attendance:'+p.section_id]);
 const t=(await c.query("select t.*,x.section_name from timetable t join academic_sections x on x.id=t.academic_section_id where t.id=$1 and t.academic_section_id=$2 and t.status='published' and t.entry_type in ('class','lab') and t.day_of_week=extract(dow from clock_timestamp() at time zone 'Asia/Kolkata') and (clock_timestamp() at time zone 'Asia/Kolkata')::time>=t.start_time and (clock_timestamp() at time zone 'Asia/Kolkata')::time<t.end_time",[p.timetable_id,p.section_id])).rows[0];
 if(!t)fail(409,'Choose the current published timetable period.');
 await c.query("update attendance_sessions set status='closed',stopped_at=expires_at where mobile_mode and academic_section_id=$1 and status='open' and expires_at<=clock_timestamp()",[p.section_id]);
 if((await c.query("select 1 from attendance_sessions where mobile_mode and academic_section_id=$1 and (status='open' or (period=$2 and (starts_at at time zone 'Asia/Kolkata')::date=(clock_timestamp() at time zone 'Asia/Kolkata')::date))",[p.section_id,t.id])).rowCount)fail(409,'This period already has a session.');
 const a=(await c.query("insert into attendance_sessions(coordinator_user_id,subject_id,section,session_code,academic_section_id,classroom_id,faculty_id,verification_mode,mobile_mode,period,starts_at,expires_at,late_expires_at) values($1,$2,$3,$4,$5,$6,$7,'mobile_ble',true,$8,clock_timestamp(),clock_timestamp()+interval '60 seconds',clock_timestamp()+interval '180 seconds') returning *",[req.user.sub,t.subject_id,t.section_name,crypto.randomBytes(16).toString('hex'),p.section_id,t.classroom_id,t.faculty_id,t.id])).rows[0];
 await c.query("insert into session_roster select $1,id from students where academic_section_id=$2 and face_enrolled and enrollment_status='approved' and embedding_model=$3 and bound_device_id is not null",[a.id,p.section_id,MODEL]);
 for(let slot=0;slot<8;slot++)await c.query("insert into ble_tokens values($1,$2,$3,$4::timestamptz+($2*interval '8 seconds'),least($5::timestamptz,$4::timestamptz+(($2+1)*interval '8 seconds')))",[a.id,slot,crypto.randomBytes(12).toString('hex'),a.starts_at,a.expires_at]);
 await c.query('insert into broadcasters select r.session_id,r.student_id from session_roster r join students s on s.id=r.student_id join mobile_fcm_devices d on d.user_id=s.user_id and d.device_id=s.bound_device_id and d.can_advertise where r.session_id=$1 and r.student_id<>$2 order by random() limit 3',[a.id,s.id]);
 await enqueueSessionPushes(c,a.id);
 await audit(c,'session_started',req.user.sub,a.id,{section_id:p.section_id});
 return {id:a.id,section_id:a.academic_section_id,period:a.period,started_at:a.starts_at,expires_at:a.expires_at,status:a.status};
 });res.status(201).json({session:result});
});
mobileAttendanceRouter.get('/session/:id/token',students,async(req,res)=>{
 const a=await session(pool,req.params.id),s=await student(pool,req.user.sub);await member(pool,a.id,s);
 if(a.coordinator_user_id!==req.user.sub&&!(await pool.query('select 1 from broadcasters where session_id=$1 and student_id=$2',[a.id,s.id])).rowCount)fail(403,'Only assigned broadcasters may fetch tokens.');
 const device=parse(z.object({device_id:deviceSchema}).strict(),req.query).device_id;enrolled(s,device);
 if(s.academic_section_id!==a.academic_section_id)fail(403,'Section access required.');
 if(!windowOpen(a,'ble'))fail(409,'Session closed.');
 const t=(await pool.query('select token,valid_from,valid_to from ble_tokens where session_id=$1 and valid_from<=clock_timestamp() and valid_to>clock_timestamp()',[a.id])).rows[0];if(!t)fail(409,'Token expired.');res.json({...t,expires_at:a.expires_at,server_time:new Date().toISOString(),valid_for_ms:Math.max(0,new Date(t.valid_to).getTime()-Date.now())});
});
mobileAttendanceRouter.post('/session/:id/token/validate',students,async(req,res)=>{
 const p=parse(z.object({device_id:deviceSchema,ble_token:z.string().regex(/^[a-f0-9]{24}$/)}).strict(),req.body);
 const a=await session(pool,req.params.id),s=await student(pool,req.user.sub);await member(pool,a.id,s);enrolled(s,p.device_id);
 if(s.academic_section_id!==a.academic_section_id)fail(403,'Section access required.');
 if(!windowOpen(a,'ble'))fail(409,'Session closed.');
 await checkToken(pool,a,p.ble_token);
 const t=(await pool.query('select valid_to from ble_tokens where session_id=$1 and token=$2',[a.id,p.ble_token])).rows[0];
 const end=Math.min(new Date(a.expires_at).getTime(),new Date(t.valid_to).getTime()+8000);
 res.json({accepted:true,valid_for_ms:Math.max(0,end-Date.now()),server_time:new Date().toISOString()});
});
mobileAttendanceRouter.post('/session/:id/challenge',students,async(req,res)=>{
 const p=parse(z.object({device_id:deviceSchema,method:z.enum(['ble','fallback']),ble_token:z.string().regex(/^[a-f0-9]{24}$/).optional()}).strict().refine(v=>v.method!=='ble'||!!v.ble_token),req.body);
 const ch=await transaction(async c=>{
 const a=await session(c,req.params.id),s=await student(c,req.user.sub);await member(c,a.id,s);enrolled(s,p.device_id);ownSection(a,s);
 if(!windowOpen(a,p.method))fail(409,'Attendance window closed.');
 await c.query('select pg_advisory_xact_lock(hashtext($1))',[a.id+s.id]);
 if(p.method==='ble')await checkToken(c,a,p.ble_token);
 const n=(await c.query('select count(*)::int n from mobile_attendance_challenges where session_id=$1 and student_id=$2',[a.id,s.id])).rows[0].n;if(n>=8)fail(429,'Too many attempts.');
 const type=['blink','turn_left','turn_right','smile'][crypto.randomInt(4)];
 return (await c.query("insert into mobile_attendance_challenges(session_id,student_id,device_id,challenge_type,method,expires_at) values($1,$2,$3,$4,$5,least($6::timestamptz,clock_timestamp()+interval '8 seconds')) returning id,challenge_type,expires_at",[a.id,s.id,p.device_id,type,p.method,p.method==='ble'?a.expires_at:a.late_expires_at])).rows[0];
 });res.status(201).json({challenge:{...ch,valid_for_ms:Math.max(0,new Date(ch.expires_at).getTime()-Date.now())},server_time:new Date().toISOString()});
});
function validateChallenge(ch,a,s,p,method){if(!ch||ch.session_id!==a.id||ch.student_id!==s.id||ch.device_id!==p.device_id||ch.method!==method||ch.challenge_type!==p.challenge_type||ch.used_at||new Date(ch.expires_at).getTime()<=Date.now())fail(403,'Challenge invalid, expired, or used.');}
async function submit(req,res,method){
 const p=parse(submissionSchema,req.body);if(method==='ble'&&!p.ble_token)fail(400,'Bluetooth token required.');
 const a=await session(pool,req.params.id),s=await student(pool,req.user.sub);ownSection(a,s);
 if(p.student_id!==s.id)fail(403,'Submit only your own attendance.');await member(pool,a.id,s);
 if(!windowOpen(a,method))fail(409,'Attendance window closed.');
 try{enrolled(s,p.device_id);}catch(e){await audit(pool,'device_or_enrollment_rejected',req.user.sub,a.id);throw e;}
 const minimum=threshold(),score=cosineSimilarity(p.embedding,s.face_embedding||[]);
 if(score<minimum){await audit(pool,'face_mismatch',req.user.sub,a.id);fail(422,'Face did not match enrollment.');}
 const millis=Date.parse(p.timestamp);if(millis>Date.now()+5000||millis<Date.now()-15000)fail(400,'Submission timestamp expired.');
 const ch=(await pool.query('select * from mobile_attendance_challenges where id=$1',[p.challenge_id])).rows[0];validateChallenge(ch,a,s,p,method);
 if(method==='ble')await checkToken(pool,a,p.ble_token);
 if(!await verifyIntegrity(p.integrity_token,requestHash(a.id,p,method)))fail(403,'App or device integrity check failed.');
 await transaction(async c=>{
 const fresh=(await c.query('select * from students where id=$1 for update',[s.id])).rows[0];enrolled(fresh,p.device_id);
 if(cosineSimilarity(p.embedding,fresh.face_embedding||[])<minimum)fail(403,'Enrollment changed.');
 const current=await session(c,a.id,true);ownSection(current,fresh);await member(c,current.id,fresh);if(!windowOpen(current,method))fail(409,'Attendance window closed.');
 const locked=(await c.query('select * from mobile_attendance_challenges where id=$1 for update',[p.challenge_id])).rows[0];validateChallenge(locked,current,fresh,p,method);
 if(method==='ble')await checkToken(c,current,p.ble_token);
 const r=await c.query("insert into attendance_records(session_id,student_id,status,method,similarity,challenge_type,device_id,is_late) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(session_id,student_id) do update set status=excluded.status,method=excluded.method,similarity=excluded.similarity,challenge_type=excluded.challenge_type,device_id=excluded.device_id,is_late=excluded.is_late,created_at=clock_timestamp() where attendance_records.status='ABSENT' returning student_id",[a.id,s.id,method==='ble'?'PRESENT':'LATE',method,score,p.challenge_type,p.device_id,method==='fallback']);
 if(!r.rowCount)fail(409,'Attendance already submitted.');
 await c.query('update mobile_attendance_challenges set used_at=clock_timestamp() where id=$1',[locked.id]);
 await audit(c,method==='ble'?'attendance_present':'late_checkin_review',req.user.sub,a.id,{similarity:score,method});
 if(method==='fallback'){const n=(await c.query("select count(*)::int n from attendance_records where student_id=$1 and method='fallback' and created_at>now()-interval '30 days'",[s.id])).rows[0].n;if(n>=3)await audit(c,'frequent_fallback',req.user.sub,a.id,{count:n});}
 });res.status(201).json({status:method==='ble'?'PRESENT':'LATE',method,similarity:score,is_late:method==='fallback'});
}
mobileAttendanceRouter.post('/session/:id/submit',students,(req,res)=>submit(req,res,'ble'));
mobileAttendanceRouter.post('/session/:id/late-checkin',students,(req,res)=>submit(req,res,'fallback'));
mobileAttendanceRouter.get('/session/:id/status',async(req,res)=>{
 const a=await session(pool,req.params.id);if(!await canRead(a,req.user))fail(403,'Section access required.');
 const manager=req.user.roles.includes('student_coordinator')&&(await pool.query('select 1 from student_coordinator_sections where user_id=$1 and academic_section_id=$2',[req.user.sub,a.academic_section_id])).rowCount;
 const rows=(await pool.query('select s.id student_id,s.roll_number,u.full_name,r.status from session_roster sr join students s on s.id=sr.student_id join users u on u.id=s.user_id left join attendance_records r on r.session_id=sr.session_id and r.student_id=sr.student_id where sr.session_id=$1 order by s.roll_number',[a.id])).rows;
 res.json({id:a.id,expires_at:a.expires_at,status:windowOpen(a,'ble')?'open':'closed',total:rows.length,present:rows.filter(r=>r.status==='PRESENT').length,late:rows.filter(r=>r.status==='LATE').length,...(manager?{unmarked:rows.filter(r=>!r.status||r.status==='ABSENT')}: {})});
});
mobileAttendanceRouter.get('/session/:id/report',allowRoles('faculty','academic_coordinator','admin'),async(req,res)=>{
 const a=await session(pool,req.params.id);if(!await canRead(a,req.user,false))fail(403,'Section report access required.');if(Date.now()<new Date(a.expires_at).getTime())fail(409,'Reports are available after the session closes.');
 const rows=(await pool.query("select s.id student_id,s.roll_number,u.full_name,coalesce(r.status,'ABSENT') status,r.method,r.similarity,r.challenge_type,r.is_late,r.created_at from session_roster sr join students s on s.id=sr.student_id join users u on u.id=s.user_id left join attendance_records r on r.session_id=sr.session_id and r.student_id=sr.student_id where sr.session_id=$1 order by s.roll_number",[a.id])).rows;
 res.json({session:{id:a.id,period:a.period,expires_at:a.expires_at},students:rows});
});
mobileAttendanceRouter.get('/history',students,async(req,res)=>{
 const s=await student(pool,req.user.sub);res.json({attendance:(await pool.query('select r.session_id,r.status,r.method,r.is_late,r.created_at,a.period,a.starts_at from attendance_records r join attendance_sessions a on a.id=r.session_id where r.student_id=$1 order by a.starts_at desc limit 200',[s.id])).rows});
});
