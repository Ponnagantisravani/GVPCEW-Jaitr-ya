import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
import {demoEnabled} from './localAttendanceDemo.js';
import {startMobileSession} from '../services/mobileAttendanceLifecycle.js';
import {subjectTransaction,coordinatorClass,classSubjects,timetableSlots,prepareSubjectSession,attachSubjectSession,closeSubjectSession,recordStatusSQL} from '../services/subjectAttendance.js';
import {fail,subjectMatches} from '../services/subjectAttendancePolicy.js';
export const subjectAttendanceRouter=Router();subjectAttendanceRouter.use(requireAuth);
const coordinators=allowRoles('student_coordinator'),faculty=allowRoles('faculty'),students=allowRoles('student','student_coordinator');
const uuid=z.string().uuid();const payload=z.object({subjectId:uuid,period:z.number().int().min(1).max(20),batchId:uuid.optional(),durationSeconds:z.number().int().min(30).max(1800).default(600)}).strict();
subjectAttendanceRouter.get('/subjects',coordinators,async(req,res)=>{const x=await coordinatorClass(pool,req.user.sub);const [subjects,slots,batches]=await Promise.all([classSubjects(pool,x.id),timetableSlots(pool,x.id),pool.query('select b.id,b.name,(select count(*)::int from subject_attendance_batch_members m join students s on s.id=m.student_id and s.academic_section_id=b.section_id join users u on u.id=s.user_id and u.active where m.batch_id=b.id) student_count from subject_attendance_batches b where section_id=$1 order by name',[x.id])]);res.json({section:x,subjects,slots,batches:batches.rows,default_duration_seconds:600,demo:demoEnabled()});});
subjectAttendanceRouter.post('/sessions',coordinators,async(req,res)=>{
 const p=payload.safeParse(req.body);if(!p.success)fail(400,'Choose a subject, a period and a 30–1800 second time limit.');let result;
 if(demoEnabled())result=await subjectTransaction(async c=>{
  const setup=await prepareSubjectSession(c,req.user.sub,p.data);
  await c.query('select pg_advisory_xact_lock(hashtext($1))',['local-attendance-demo:'+setup.section.id]);
  if((await c.query('select 1 from local_attendance_demo_sessions d where section_id=$1 and late_expires_at>clock_timestamp() and not exists(select 1 from subject_attendance_sessions sa where sa.source_session_id=d.id)',[setup.section.id])).rowCount)fail(409,'A local camera session is already open. End it before starting another.');
  const source=(await c.query("insert into local_attendance_demo_sessions(section_id,coordinator_user_id,expires_at,late_expires_at) values($1,$2,statement_timestamp()+($3::integer*interval '1 second'),statement_timestamp()+($3::integer*interval '1 second')) returning *",[setup.section.id,req.user.sub,p.data.durationSeconds])).rows[0];
  await c.query('insert into local_attendance_demo_roster(session_id,student_id) select $1,unnest($2::uuid[])',[source.id,setup.roster.map(s=>s.id)]);
  return attachSubjectSession(c,source,'demo',setup,req.user.sub);
 });else{
  const x=await coordinatorClass(pool,req.user.sub);
  const setup=await subjectTransaction(c=>prepareSubjectSession(c,req.user.sub,p.data));
  const t=setup.slots.find(s=>s.period===p.data.period&&subjectMatches(s,setup.subject));
  const s=(await pool.query('select bound_device_id from students where user_id=$1',[req.user.sub])).rows[0];
  if(!s?.bound_device_id)fail(409,'Start from your registered Android phone after face enrollment and Bluetooth notification setup.');
  result=await startMobileSession({userId:req.user.sub,deviceId:s.bound_device_id,sectionId:x.id,timetableId:t.id,durationSeconds:p.data.durationSeconds,subjectSetup:p.data});
  result=(await pool.query('select a.*,s.display_name subject_name,array(select period from subject_attendance_periods where session_id=a.id order by period) periods from subject_attendance_sessions a join subject_attendance_subjects s on s.subject_id=a.subject_id where a.id=$1',[result.subject_session_id])).rows[0];
 }
 res.status(201).json({session:result});
});
subjectAttendanceRouter.get('/sessions/current',coordinators,async(req,res)=>{
 const x=await coordinatorClass(pool,req.user.sub);
 const a=(await pool.query('select a.*,s.display_name subject_name,array(select period from subject_attendance_periods where session_id=a.id order by period) periods from subject_attendance_sessions a join subject_attendance_subjects s on s.subject_id=a.subject_id where a.section_id=$1 and a.coordinator_user_id=$2 order by started_at desc limit 1',[x.id,req.user.sub])).rows[0];res.json({session:a||null});
});
subjectAttendanceRouter.post('/sessions/:id/end',coordinators,async(req,res)=>{
 if(!uuid.safeParse(req.params.id).success)fail(400,'Invalid session.');
 await subjectTransaction(async c=>{const x=await coordinatorClass(c,req.user.sub);const a=(await c.query('select id from subject_attendance_sessions where id=$1 and coordinator_user_id=$2 and section_id=$3',[req.params.id,req.user.sub,x.id])).rows[0];if(!a)fail(403,'You can only end sessions you created for your own class.');await closeSubjectSession(c,a.id);});
 res.json({message:'Session closed. Unmarked roster members are now Absent.'});
});
subjectAttendanceRouter.get('/faculty/subjects',faculty,async(req,res)=>{res.json({subjects:(await pool.query('select sa.*,s.code from subject_attendance_subjects sa join subjects s on s.id=sa.subject_id where lower(sa.faculty_email)=lower($1) order by sa.display_name',[req.user.email])).rows});});

subjectAttendanceRouter.get('/faculty/subjects/:id/attendance',faculty,async(req,res)=>{
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(req.query.date),period=z.coerce.number().int().min(1).max(20).safeParse(req.query.period);
 if(!uuid.safeParse(req.params.id).success||!date.success||!period.success)fail(400,'Select a valid date and period.');
 if(!(await pool.query('select 1 from subject_attendance_subjects where subject_id=$1 and lower(faculty_email)=lower($2)',[req.params.id,req.user.email])).rowCount)fail(403,'This subject is not assigned to your faculty email.');
 const rows=(await pool.query("select a.id session_id,a.source_kind,a.attendance_date,a.batch_id,x.section_name,a.closed_at,r.period,s.id student_id,s.roll_number,u.full_name,"+recordStatusSQL+" status from subject_attendance_records r join subject_attendance_sessions a on a.id=r.session_id join students s on s.id=r.student_id join users u on u.id=s.user_id join academic_sections x on x.id=a.section_id where a.subject_id=$1 and lower(a.faculty_email)=lower($2) and a.attendance_date=$3::date and r.period=$4 order by x.section_name,s.roll_number",[req.params.id,req.user.email,date.data,period.data])).rows;
 const summary=(await pool.query("with records as (select a.source_kind,x.academic_year,r.student_id,"+recordStatusSQL+" status from subject_attendance_records r join subject_attendance_sessions a on a.id=r.session_id join academic_sections x on x.id=a.section_id join students s on s.id=r.student_id and s.academic_section_id=a.section_id where a.subject_id=$1 and lower(a.faculty_email)=lower($2)) select s.roll_number,u.full_name,r.source_kind,r.academic_year,count(*) filter(where r.status='Present')::int attended,count(*) filter(where r.status<>'Pending')::int total,count(*) filter(where r.status='Pending')::int pending from records r join students s on s.id=r.student_id join users u on u.id=s.user_id group by s.roll_number,u.full_name,r.source_kind,r.academic_year order by s.roll_number",[req.params.id,req.user.email])).rows;
 const present=rows.filter(r=>r.status==='Present').length;
 res.json({students:rows,summary,counts:{present,absent:rows.filter(r=>r.status==='Absent').length,pending:rows.filter(r=>r.status==='Pending').length,total:rows.length,percentage:rows.length?Math.round(1000*present/rows.length)/10:null}});
});
subjectAttendanceRouter.get('/student/attendance',students,async(req,res)=>{
 const s=(await pool.query('select id,academic_section_id from students where user_id=$1',[req.user.sub])).rows[0];if(!s)fail(403,'Student account required.');
 const subjects=await classSubjects(pool,s.academic_section_id);
 const records=(await pool.query("select a.id session_id,a.subject_id,sa.display_name subject_name,a.source_kind,to_char(a.attendance_date,'YYYY-MM-DD') date,x.academic_year,r.period,"+recordStatusSQL+" status from subject_attendance_records r join subject_attendance_sessions a on a.id=r.session_id join subject_attendance_subjects sa on sa.subject_id=a.subject_id join academic_sections x on x.id=a.section_id where r.student_id=$1 and a.section_id=$2 order by a.attendance_date desc,r.period",[s.id,s.academic_section_id])).rows;
 const today=(await pool.query("select to_char((clock_timestamp() at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD') today")).rows[0].today;
 const summaries=subjects.flatMap(subject=>['official','demo'].map(source_kind=>{
  const rows=records.filter(r=>r.subject_id===subject.subject_id&&r.source_kind===source_kind),attended=rows.filter(r=>r.status==='Present').length,total=rows.filter(r=>r.status!=='Pending').length;
  return {...subject,source_kind,attended,total,pending:rows.filter(r=>r.status==='Pending').length,percentage:total?Math.round(attended*1000/total)/10:null};
 }).filter(s=>s.source_kind==='official'||records.some(r=>r.subject_id===s.subject_id&&r.source_kind==='demo')));
 res.json({today,records,subjects:summaries});
});
