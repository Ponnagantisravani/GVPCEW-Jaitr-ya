import {prepareSubjectSession,attachSubjectSession,timetableSlots} from './subjectAttendance.js';
import {parseAttendanceDuration} from './attendanceDuration.js';
import crypto from 'node:crypto';
import {pool} from '../config/db.js';
import {MODEL,threshold} from './mobileAttendancePolicy.js';
import {integrityReady} from './mobileIntegrity.js';
import {fcmReady} from './mobileFcm.js';
import {enqueueSessionPushes} from './mobilePushQueue.js';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export async function attendanceTransaction(fn,db=pool){
 const c=await db.connect();
 try{await c.query('begin');const result=await fn(c);await c.query('commit');return result;}
 catch(error){await c.query('rollback');throw error;}
 finally{c.release();}
}
export function mobileStartReady(){
 try{threshold();return integrityReady()&&fcmReady();}catch{return false;}
}
export function requireMobileStartReady(){
 threshold();if(!integrityReady())fail(503,'Configure Play Integrity before starting mobile attendance.');
 if(!fcmReady())fail(503,'Configure Firebase messaging before starting mobile attendance.');
}

// Session FOR UPDATE conflicts with the submission's FOR SHARE. Both operations
// use the server clock, so no accepted PRESENT row can be overwritten by closure.
export async function closeExpiredSessions(db=pool,sectionId=null){
 return attendanceTransaction(async c=>{
  const sessions=(await c.query("select id from attendance_sessions where mobile_mode and status='open' and expires_at<=clock_timestamp() and ($1::uuid is null or academic_section_id=$1) order by expires_at for update skip locked",[sectionId])).rows;
  for(const {id} of sessions){
   await c.query("insert into attendance_records(session_id,student_id,status,created_at) select r.session_id,r.student_id,'ABSENT',a.expires_at from session_roster r join attendance_sessions a on a.id=r.session_id where r.session_id=$1 on conflict(session_id,student_id) do nothing",[id]);
   await c.query("update attendance_sessions set status='closed',stopped_at=coalesce(stopped_at,expires_at) where id=$1",[id]);
   await c.query("update mobile_push_outbox set state='expired',last_error='session_closed' where session_id=$1 and state='pending'",[id]);
   await c.query("insert into audit_log(event,session_id,details) values('session_auto_closed',$1,'{}')",[id]);
  }
  return sessions.length;
 },db);
}

// Called by both the mobile route and timetable worker. The advisory lock scopes
// duplicate protection to one section; unrelated sections proceed independently.
export async function startMobileSession({userId,deviceId,sectionId,timetableId,defaultAttendance=false,source='coordinator',durationSeconds=60,subjectSetup=null},db=pool){
 durationSeconds=parseAttendanceDuration(durationSeconds);
 requireMobileStartReady();
 // Release old session row locks before the new roster takes enrollment FK locks.
 await closeExpiredSessions(db,sectionId);
 return attendanceTransaction(async c=>{
  let setup=subjectSetup?await prepareSubjectSession(c,userId,subjectSetup):null;
  // Native starts and timetable starts must feed the same subject reports as
  // starts from the coordinator dashboard. Take the subject lock first in all
  // paths so racing dashboard/native starts cannot invert lock order.
  if(!setup&&!defaultAttendance){
   const mapped=(await c.query('select t.subject_id from timetable t join subject_attendance_subjects sa on sa.subject_id=t.subject_id where t.id=$1 and t.academic_section_id=$2',[timetableId,sectionId])).rows[0];
   if(mapped?.subject_id){
    const slot=(await timetableSlots(c,sectionId)).find(p=>p.id===timetableId);
    if(!slot)fail(409,'Choose a published period for today.');
    setup=await prepareSubjectSession(c,userId,{subjectId:mapped.subject_id,period:slot.period});
   }
  if(setup){
   const selected=setup.slots.find(p=>p.id===timetableId&&p.subject_id===setup.subject.subject_id&&(!subjectSetup||p.period===subjectSetup.period));
   if(!selected)fail(409,'Choose a period that matches the selected subject in today\'s published timetable.');
  }
  }
  await c.query('select pg_advisory_xact_lock(hashtext($1))',['mobile-attendance:'+sectionId]);
  const s=(await c.query('select * from students where user_id=$1 for update',[userId])).rows[0];
  if(!s||!s.face_enrolled||s.embedding_model!==MODEL||s.enrollment_status!=='approved'||s.bound_device_id!==deviceId)fail(403,'Approved MobileFaceNet enrollment on your bound device is required.');
  if(!(await c.query('select 1 from mobile_fcm_devices where user_id=$1 and device_id=$2 and can_advertise',[userId,deviceId])).rowCount)fail(409,'Register notifications on a phone that supports Bluetooth broadcasting before starting.');
  if(s.academic_section_id!==sectionId||!(await c.query('select 1 from student_coordinator_sections cs join users u on u.id=cs.user_id and u.active where (u.role=\'student_coordinator\' or exists(select 1 from user_roles ur where ur.user_id=u.id and ur.role=\'student_coordinator\')) and cs.user_id=$1 and cs.academic_section_id=$2',[userId,sectionId])).rowCount)fail(403,'Coordinator assignment to your own section is required.');
  let t;
  if(defaultAttendance){
   if(source!=='coordinator'||subjectSetup||timetableId)fail(400,'Default attendance uses only your assigned section.');
   const section=(await c.query('select * from academic_sections where id=$1',[sectionId])).rows[0];
   if(!section)fail(403,'Section access required.');
   const subject=(await c.query("insert into subjects(department_id,code,name) values($1,$2,'Default attendance') on conflict(code) do update set name=excluded.name returning id",[section.department_id,'DEFAULT-ATTENDANCE-'+sectionId])).rows[0];
   t={id:'default:'+crypto.randomUUID(),subject_id:subject.id,section_name:section.section_name,classroom_id:null,faculty_id:null};
  }else t=(await c.query("select t.*,x.section_name from timetable t join academic_sections x on x.id=t.academic_section_id where t.id=$1 and t.academic_section_id=$2 and t.status='published' and t.entry_type in ('class','lab') and t.day_of_week=extract(dow from clock_timestamp() at time zone 'Asia/Kolkata') and (clock_timestamp() at time zone 'Asia/Kolkata')::time>=t.start_time and (clock_timestamp() at time zone 'Asia/Kolkata')::time<t.end_time for share of t",[timetableId,sectionId])).rows[0];
  if(!t)fail(409,'Choose the current published timetable period.');
  if((await c.query("select 1 from attendance_sessions where mobile_mode and academic_section_id=$1 and (status='open' or (period=$2 and (starts_at at time zone 'Asia/Kolkata')::date=(clock_timestamp() at time zone 'Asia/Kolkata')::date))",[sectionId,t.id])).rowCount)fail(409,defaultAttendance?'Attendance is already open for your section.':'This period already has a session.');
  if(setup&&setup.section.id!==sectionId)fail(403,'Subject class differs from your own class.');
  const a=(await c.query("insert into attendance_sessions(coordinator_user_id,subject_id,section,session_code,academic_section_id,classroom_id,faculty_id,verification_mode,mobile_mode,period,starts_at,expires_at,late_expires_at,start_source) values($1,$2,$3,$4,$5,$6,$7,'mobile_ble',true,$8,statement_timestamp(),statement_timestamp()+($10::integer*interval '1 second'),statement_timestamp()+(($10::integer+120)*interval '1 second'),$9) returning *",[userId,t.subject_id,t.section_name,crypto.randomBytes(16).toString('hex'),sectionId,t.classroom_id,t.faculty_id,t.id,source,durationSeconds])).rows[0];
  await c.query("insert into session_roster select $1,s.id from students s join users u on u.id=s.user_id and u.active where s.academic_section_id=$2 and s.face_enrolled and s.enrollment_status='approved' and s.embedding_model=$3 and s.bound_device_id is not null",[a.id,sectionId,MODEL]);
  if(setup){await c.query('delete from session_roster where session_id=$1 and not(student_id=any($2::uuid[]))',[a.id,setup.roster.map(s=>s.id)]);}
  const subjectSession=setup?await attachSubjectSession(c,a,'official',setup,userId):null;
  for(let slot=0;slot<Math.ceil(durationSeconds/8);slot++)await c.query("insert into ble_tokens(session_id,slot,token,valid_from,valid_to) values($1,$2::integer,$3,$4::timestamptz+($2::integer*interval '8 seconds'),least($5::timestamptz,$4::timestamptz+(($2::integer+1)*interval '8 seconds')))",[a.id,slot,crypto.randomBytes(12).toString('hex'),a.starts_at,a.expires_at]);
  await c.query('insert into broadcasters select r.session_id,r.student_id from session_roster r join students s on s.id=r.student_id join users u on u.id=s.user_id and u.active join mobile_fcm_devices d on d.user_id=s.user_id and d.device_id=s.bound_device_id and d.can_advertise where r.session_id=$1 and r.student_id<>$2 order by random() limit 3',[a.id,s.id]);
  await enqueueSessionPushes(c,a.id);
  await c.query('insert into audit_log(event,actor_id,session_id,details) values($1,$2,$3,$4)',['session_started',userId,a.id,JSON.stringify({section_id:sectionId,source,default_attendance:defaultAttendance})]);
  return {...(subjectSession?{subject_session_id:subjectSession.id,periods:subjectSession.periods,subject_name:subjectSession.subject_name}:{}),id:a.id,section_id:a.academic_section_id,period:a.period,started_at:a.starts_at,expires_at:a.expires_at,late_expires_at:a.late_expires_at,status:a.status,broadcast:true};
 },db);
}

export async function autoStartTimetableSessions(db=pool,start=startMobileSession){
 if(!mobileStartReady())return 0;
 const configured=Number(process.env.MOBILE_AUTO_START_GRACE_SECONDS??15);
 const grace=Number.isFinite(configured)&&configured>=5&&configured<=60?configured:15;
 const due=(await db.query("select t.id timetable_id,t.academic_section_id section_id,c.user_id,c.bound_device_id from timetable t join lateral (select s.user_id,s.bound_device_id from student_coordinator_sections cs join students s on s.user_id=cs.user_id and s.academic_section_id=cs.academic_section_id join users u on u.id=s.user_id and u.active join mobile_fcm_devices d on d.user_id=s.user_id and d.device_id=s.bound_device_id and d.can_advertise where cs.academic_section_id=t.academic_section_id and (u.role='student_coordinator' or exists(select 1 from user_roles ur where ur.user_id=u.id and ur.role='student_coordinator')) and s.face_enrolled and s.enrollment_status='approved' and s.embedding_model=$1 and s.bound_device_id is not null order by d.updated_at desc,s.id limit 1) c on true where t.status='published' and t.entry_type in ('class','lab') and t.day_of_week=extract(dow from clock_timestamp() at time zone 'Asia/Kolkata') and (clock_timestamp() at time zone 'Asia/Kolkata')::time>=t.start_time and (clock_timestamp() at time zone 'Asia/Kolkata')::time<t.end_time and extract(epoch from ((clock_timestamp() at time zone 'Asia/Kolkata')::time-t.start_time)) between $2 and 120 and not exists(select 1 from attendance_sessions a where a.mobile_mode and a.academic_section_id=t.academic_section_id and (a.status='open' or (a.period=t.id::text and (a.starts_at at time zone 'Asia/Kolkata')::date=(clock_timestamp() at time zone 'Asia/Kolkata')::date))) order by t.start_time,t.id",[MODEL,grace])).rows;
 let count=0;
 for(const p of due){try{await start({userId:p.user_id,deviceId:p.bound_device_id,sectionId:p.section_id,timetableId:p.timetable_id,source:'timetable'},db);count++;}catch(error){if(![403,409].includes(error.status))throw error;}}
 return count;
}

export async function cleanupExpiredMobileData(db=pool){
 // Keep enrollment templates and attendance/audit history. Delete only previews
 // whose disclosed seven-day retention has ended, and ephemeral session proofs.
 await db.query('update students set enrollment_preview=null,enrollment_preview_expires_at=null where enrollment_preview_expires_at<=clock_timestamp()');
 await db.query('delete from ble_tokens t using attendance_sessions a where a.id=t.session_id and a.mobile_mode and a.expires_at<=clock_timestamp()');
 await db.query('delete from mobile_attendance_challenges c using attendance_sessions a where a.id=c.session_id and a.mobile_mode and a.late_expires_at<=clock_timestamp()');
}
export function startAttendanceLifecycleWorker(){
 let stopped=false,busy=false,lastCleanup=0;
 const tick=async()=>{if(stopped||busy)return;busy=true;try{
  await closeExpiredSessions();
  await autoStartTimetableSessions();
  if(Date.now()-lastCleanup>=60000){await cleanupExpiredMobileData();lastCleanup=Date.now();}
 }catch(error){console.error('Mobile attendance lifecycle unavailable. Check the Stage 6 migration and database configuration.',error.code||error.status||'');}finally{busy=false;}};
 const timer=setInterval(()=>void tick(),1000);timer.unref();void tick();
 return ()=>{stopped=true;clearInterval(timer);};
}
