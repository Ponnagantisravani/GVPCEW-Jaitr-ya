import {markPresent} from '../services/subjectAttendance.js';
import {attendanceDurationSchema} from '../services/attendanceDuration.js';
import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
export const localAttendanceDemoRouter=Router();
export const demoEnabled=()=>process.env.NODE_ENV==='development'&&process.env.LOCAL_ATTENDANCE_DEMO==='true';
export const demoPhase=(expires,lateExpires,now=Date.now())=>now<new Date(expires).getTime()?'main':now<new Date(lateExpires).getTime()?'late':'final';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
localAttendanceDemoRouter.use((req,res,next)=>{if(!demoEnabled())return res.status(404).json({message:'Local attendance demo is disabled.'});next();});
localAttendanceDemoRouter.use(requireAuth,allowRoles('student','student_coordinator'));
async function ownStudent(c,user,lock=false){const s=(await c.query('select id,academic_section_id from students where user_id=$1'+(lock?' for share':''),[user])).rows[0];if(!s?.academic_section_id)fail(403,'Your account needs an assigned class section.');return s;}
async function withTransaction(fn){const c=await pool.connect();try{await c.query('begin');const result=await fn(c);await c.query('commit');return result;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
async function faceService(path,body) {
 if(!process.env.LOCAL_FACE_SERVICE_KEY)fail(503,'Start the backend with dev:local-demo to enable the webcam service.');
 let response;try{response=await fetch('http://127.0.0.1:5002/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Face-Service-Key':process.env.LOCAL_FACE_SERVICE_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{fail(503,'Local face service is unavailable. Check backend startup and retry.');}
 const result=await response.json();if(!response.ok)fail(response.status===422?422:503,result.message||'Face verification failed.');return result;
}
const imageSchema=z.string().max(100000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
localAttendanceDemoRouter.get('/configuration',async(req,res)=>{const s=await ownStudent(pool,req.user.sub);const face=(await pool.query('select model from local_attendance_demo_faces where student_id=$1',[s.id])).rows[0];res.json({enabled:true,face_enrolled:!!face,label:'Local webcam demo — face comparison and heuristic blink; no Bluetooth or certified anti-spoofing'});});
localAttendanceDemoRouter.post('/face/enroll',async(req,res)=>{
 const parsed=z.object({image:imageSchema,consent:z.literal(true)}).strict().safeParse(req.body);if(!parsed.success)fail(400,'Capture a valid camera image and consent to saving a local face reference.');
 const s=await ownStudent(pool,req.user.sub);const result=await faceService('enroll',{image:parsed.data.image});
 if(result.model!=='opencv-sface-demo-v1'||result.faceCount!==1||!z.array(z.number().finite()).length(128).safeParse(result.embedding).success)fail(503,'Invalid face-service response.');
 const saved=await pool.query("insert into local_attendance_demo_faces(student_id,embedding,model) values($1,$2,$3) on conflict do nothing returning student_id",[s.id,result.embedding,result.model]);if(!saved.rowCount)fail(409,'You already have a local face reference.');res.status(201).json({face_enrolled:true});
});
localAttendanceDemoRouter.post('/challenge',async(req,res)=>{
 const parsed=z.object({session_id:z.string().uuid()}).strict().safeParse(req.body);if(!parsed.success)fail(400,'Invalid demo session.');
 const s=await ownStudent(pool,req.user.sub);
 const result=await pool.query("insert into local_attendance_demo_challenges(session_id,student_id,reference_version,expires_at) select a.id,sr.student_id,f.version,least(clock_timestamp()+interval '20 seconds',case when a.expires_at>clock_timestamp() then a.expires_at else a.late_expires_at end) from local_attendance_demo_sessions a join local_attendance_demo_roster sr on sr.session_id=a.id and sr.student_id=$2 join local_attendance_demo_faces f on f.student_id=sr.student_id where a.id=$1 and a.section_id=$3 and a.late_expires_at>clock_timestamp() and not exists(select 1 from local_attendance_demo_records r where r.session_id=a.id and r.student_id=sr.student_id) returning id,expires_at",[parsed.data.session_id,s.id,s.academic_section_id]);if(!result.rowCount)fail(409,'A saved local face reference and an unmarked, eligible open session are required.');res.status(201).json({challenge_id:result.rows[0].id,expires_at:result.rows[0].expires_at,action:'blink'});
});
localAttendanceDemoRouter.get('/sections',allowRoles('student_coordinator'),async(req,res)=>{
 const s=await ownStudent(pool,req.user.sub);const sections=(await pool.query('select a.id,a.section_name,a.year_number,a.semester_number from academic_sections a join student_coordinator_sections cs on cs.academic_section_id=a.id where cs.user_id=$1 and a.id=$2',[req.user.sub,s.academic_section_id])).rows;res.json({sections});
});
localAttendanceDemoRouter.post('/start',allowRoles('student_coordinator'),async(req,res)=>{
 const parsed=z.object({section_id:z.string().uuid(),duration_seconds:attendanceDurationSchema}).strict().safeParse(req.body);if(!parsed.success)fail(400,'Select your assigned section and a time limit from 30 to 1800 seconds.');
 const result=await withTransaction(async c=>{
  const s=await ownStudent(c,req.user.sub,true);if(s.academic_section_id!==parsed.data.section_id)fail(403,'Your own section is required.');
  if(!(await c.query('select 1 from student_coordinator_sections where user_id=$1 and academic_section_id=$2',[req.user.sub,s.academic_section_id])).rowCount)fail(403,'Coordinator assignment required.');
  await c.query('select pg_advisory_xact_lock(hashtext($1))',['local-attendance-demo:'+s.academic_section_id]);
  if((await c.query('select 1 from local_attendance_demo_sessions where section_id=$1 and late_expires_at>clock_timestamp()',[s.academic_section_id])).rowCount)fail(409,'A demo session is already running or accepting late check-ins.');
  const a=(await c.query("insert into local_attendance_demo_sessions(section_id,coordinator_user_id,starts_at,expires_at,late_expires_at) values($1,$2,statement_timestamp(),statement_timestamp()+($3::integer*interval '1 second'),statement_timestamp()+(($3::integer+120)*interval '1 second')) returning *",[s.academic_section_id,req.user.sub,parsed.data.duration_seconds])).rows[0];
  await c.query('insert into local_attendance_demo_roster(session_id,student_id) select $1,s.id from students s join users u on u.id=s.user_id where s.academic_section_id=$2 and u.active',[a.id,s.academic_section_id]);return a;
 });res.status(201).json({session:result,demo:true});
});
localAttendanceDemoRouter.get('/current',async(req,res)=>{
 const s=await ownStudent(pool,req.user.sub);const a=(await pool.query(`select a.*,x.section_name,x.year_number,x.semester_number,d.name department_name,sa.display_name subject_name,sa.faculty_email,sa.kind subject_kind,b.name batch_name,coalesce(sp.periods,'{}'::int[]) covered_periods,c.room_code,c.room_name from local_attendance_demo_sessions a join academic_sections x on x.id=a.section_id left join departments d on d.id=x.department_id left join subject_attendance_sessions sas on sas.source_session_id=a.id left join subject_attendance_subjects sa on sa.subject_id=sas.subject_id left join subject_attendance_batches b on b.id=sas.batch_id left join lateral (select array_agg(period order by period) periods,min(period) first_period from subject_attendance_periods where session_id=sas.id) sp on true left join lateral (select ranked.classroom_id from (select t.classroom_id,dense_rank() over(order by t.start_time,t.end_time)::int period from timetable t where t.academic_section_id=a.section_id and t.status='published' and t.day_of_week=extract(dow from a.starts_at at time zone 'Asia/Kolkata')) ranked where ranked.period=sp.first_period limit 1) room on true left join classrooms c on c.id=room.classroom_id where a.section_id=$1 and (($4::boolean and a.coordinator_user_id=$3) or exists(select 1 from local_attendance_demo_roster eligible where eligible.session_id=a.id and eligible.student_id=$2)) order by a.starts_at desc limit 1`,[s.academic_section_id,s.id,req.user.sub,req.user.roles.includes('student_coordinator')])).rows[0];
 if(!a)return res.json({session:null,demo:true});
 const now=Date.now(),phase=demoPhase(a.expires_at,a.late_expires_at,now);const own=(await pool.query('select r.status,r.recorded_at from local_attendance_demo_roster sr left join local_attendance_demo_records r using(session_id,student_id) where sr.session_id=$1 and sr.student_id=$2',[a.id,s.id])).rows[0];
 const response={session:a,phase,server_time:new Date(now).toISOString(),remaining_ms:Math.max(0,new Date(phase==='main'?a.expires_at:a.late_expires_at).getTime()-now),eligible:!!own,own_status:own?.status||(own&&phase!=='main'?'ABSENT':null),demo:true};
 if(req.user.roles.includes('student_coordinator')&&(await pool.query('select 1 from student_coordinator_sections where user_id=$1 and academic_section_id=$2',[req.user.sub,s.academic_section_id])).rowCount){
  response.roster=(await pool.query('select s.roll_number,u.full_name,r.status,r.recorded_at from local_attendance_demo_roster sr join students s on s.id=sr.student_id join users u on u.id=s.user_id left join local_attendance_demo_records r using(session_id,student_id) where sr.session_id=$1 order by s.roll_number',[a.id])).rows.map(r=>({...r,status:r.status||(phase==='main'?'UNMARKED':'ABSENT')}));
 }res.json(response);
});
localAttendanceDemoRouter.post('/check-in',async(req,res)=>{
 const parsed=z.object({session_id:z.string().uuid(),challenge_id:z.string().uuid(),frames:z.array(imageSchema).min(15).max(40)}).strict().safeParse(req.body);if(!parsed.success)fail(400,'Capture the requested camera sequence before checking in.');const p=parsed.data;
 const own=await ownStudent(pool,req.user.sub);
 const proof=(await pool.query('select c.*,f.embedding from local_attendance_demo_challenges c join local_attendance_demo_faces f on f.student_id=c.student_id and f.version=c.reference_version join local_attendance_demo_sessions a on a.id=c.session_id where c.id=$1 and c.session_id=$2 and c.student_id=$3 and a.section_id=$4 and not c.used and c.expires_at>clock_timestamp()',[p.challenge_id,p.session_id,own.id,own.academic_section_id])).rows[0];if(!proof)fail(403,'Camera challenge expired or does not belong to your account.');
 const decision=await faceService('verify',{frames:p.frames,reference:proof.embedding});if(decision.identityVerified!==true||decision.blinkObserved!==true||decision.model!=='opencv-sface-demo-v1'||!Number.isFinite(decision.similarity)||decision.similarity<0.363)fail(422,'Face comparison and blink verification did not pass.');
 const result=await withTransaction(async c=>{
  const a=(await c.query('select * from local_attendance_demo_sessions where id=$1 for update',[p.session_id])).rows[0];if(!a)fail(404,'Demo session not found.');
  const s=await ownStudent(c,req.user.sub,true);if(s.academic_section_id!==a.section_id)fail(403,'Section access required.');
  const fresh=(await c.query('select c.id from local_attendance_demo_challenges c join local_attendance_demo_faces f on f.student_id=c.student_id and f.version=c.reference_version where c.id=$1 and c.session_id=$2 and c.student_id=$3 and not c.used and c.expires_at>clock_timestamp() for update of c',[p.challenge_id,a.id,s.id])).rows[0];if(!fresh)fail(409,'Camera challenge expired or was already used.');
  const phaseRow=(await c.query("select case when clock_timestamp()<$1 then 'PRESENT' when clock_timestamp()<$2 then 'LATE' else null end status",[a.expires_at,a.late_expires_at])).rows[0];if(!phaseRow.status)fail(409,'Demo check-in window has closed.');
  const r=await c.query('insert into local_attendance_demo_records(session_id,student_id,status) values($1,$2,$3) on conflict do nothing returning status,recorded_at',[a.id,s.id,phaseRow.status]);if(!r.rowCount)fail(409,'You have already checked in to this demo session.');await markPresent(a.id,s.id,c);await c.query('update local_attendance_demo_challenges set used=true where id=$1',[p.challenge_id]);return r.rows[0];
 });res.status(201).json({...result,demo:true,face_verified:true,blink_observed:true,anti_spoofing_verified:false});
});
