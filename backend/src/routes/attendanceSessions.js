import {effectiveFacultyAssignments} from '../services/teachingAssignments.js';
import {Router} from '../utils/router.js';
import crypto from 'node:crypto';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
import {verifierReady} from '../services/attendanceVerifier.js';
import {sessionResponsibility} from '../services/sessionResponsibility.js';
export const attendanceSessionRouter=Router();
attendanceSessionRouter.use(requireAuth);
const managers=allowRoles('faculty','student_coordinator');
attendanceSessionRouter.get('/catalog',managers,async(req,res)=>{
 const isFaculty=req.user.roles.includes('faculty');
 const [sections,subjects,rooms]=await Promise.all([
 pool.query(`select x.id,x.section_name,concat(d.name,' · ',x.section_name,' · ',x.academic_year) label from academic_sections x join departments d on d.id=x.department_id where
 ($2 and exists(select 1 from ${effectiveFacultyAssignments} t join faculty f on f.id=t.faculty_id where f.user_id=$1 and t.academic_section_id=x.id and t.status='active')) or (not $2 and exists(select 1 from student_coordinator_sections r where r.user_id=$1 and r.academic_section_id=x.id))`,[req.user.sub,isFaculty]),
 pool.query(`select su.id,su.code,su.name from subjects su where
 ($2 and exists(select 1 from ${effectiveFacultyAssignments} t join faculty f on f.id=t.faculty_id where t.subject_id=su.id and f.user_id=$1 and t.status='active'))
 or (not $2 and exists(select 1 from timetable t join student_coordinator_sections s on s.academic_section_id=t.academic_section_id where s.user_id=$1 and t.subject_id=su.id and t.status='published')) order by su.code`,[req.user.sub,isFaculty]),
 pool.query('select id,room_code from classrooms where active order by room_code')]);
 res.json({sections:sections.rows,subjects:subjects.rows,classrooms:rooms.rows});
});
attendanceSessionRouter.get('/active',managers,async(req,res)=>{
 const {rows}=await pool.query(`select a.id,a.session_code,a.section,a.expires_at,a.verification_mode,su.name subject,
 (select count(*)::int from attendance_session_entries e where e.session_id=a.id) present
 from attendance_sessions a join subjects su on su.id=a.subject_id where a.coordinator_user_id=$1 and a.stopped_at is null and a.expires_at>now() and ${sessionResponsibility('a')} order by a.created_at desc`,[req.user.sub]);res.json({sessions:rows});
});
attendanceSessionRouter.get('/student-active',allowRoles('student','student_coordinator'),async(req,res)=>{
 const {rows}=await pool.query(`select a.id,a.session_code,a.expires_at,a.verification_mode,
  su.code subject_code,su.name subject,d.name department,a.section
  from attendance_sessions a join subjects su on su.id=a.subject_id
  join students s on s.user_id=$1 and s.academic_section_id=a.academic_section_id
  left join departments d on d.id=s.department_id
  where a.stopped_at is null and a.expires_at>now() and ${sessionResponsibility('a')} order by a.created_at desc`,[req.user.sub]);
 res.json({sessions:rows});
});
const startSchema=z.object({verificationMode:z.enum(['code','face_bluetooth']).default('code'),subjectId:z.string().uuid(),sectionId:z.string().uuid(),classroomId:z.string().uuid(),durationMinutes:z.number().int().min(1).max(30)});
attendanceSessionRouter.post('/start',managers,async(req,res)=>{
 const p=startSchema.safeParse(req.body);if(!p.success)return res.status(400).json({message:'Choose subject, section, classroom and a 1–30 minute duration.'});
 if(p.data.verificationMode==='face_bluetooth'&&!verifierReady())return res.status(503).json({message:'Configure identity and liveness verification before opening automatic attendance.'});
 const d=p.data,client=await pool.connect();try{await client.query('begin');
 const {rows}=await client.query(`select x.section_name,case when $4::boolean then f.id else (select t.faculty_id from ${effectiveFacultyAssignments} t where t.academic_section_id=x.id and t.subject_id=su.id and t.status='active' order by t.id limit 1) end faculty_id from academic_sections x join subjects su on su.id=$2 left join faculty f on f.user_id=$3
 where x.id=$1 and su.department_id=x.department_id and
 (($4 and f.id is not null and exists(select 1 from ${effectiveFacultyAssignments} t where t.faculty_id=f.id and t.subject_id=su.id and t.academic_section_id=x.id and t.status='active'))
 or (not $4 and exists(select 1 from student_coordinator_sections s where s.user_id=$3 and s.academic_section_id=x.id)))`,[d.sectionId,d.subjectId,req.user.sub,req.user.roles.includes('faculty')]);
 if(!rows[0]?.faculty_id){await client.query('rollback');return res.status(403).json({message:'Your class or faculty assignment is incomplete. Ask the academic coordinator to check it.'});}
 await client.query("select pg_advisory_xact_lock(hashtext($1))",[d.sectionId+d.subjectId]);
 await client.query(`update attendance_sessions a set stopped_at=now() where a.academic_section_id=$1 and a.subject_id=$2 and a.stopped_at is null and not ${sessionResponsibility('a')}`,[d.sectionId,d.subjectId]);
 const running=await client.query('select id from attendance_sessions where academic_section_id=$1 and subject_id=$2 and stopped_at is null and expires_at>now()',[d.sectionId,d.subjectId]);
 if(running.rowCount){await client.query('rollback');return res.status(409).json({message:'An attendance session is already active for this class and subject.'});}
 const code=crypto.randomBytes(5).toString('hex').toUpperCase();
 const inserted=await client.query(`insert into attendance_sessions(coordinator_user_id,subject_id,section,session_code,expires_at,academic_section_id,classroom_id,faculty_id,verification_mode)
 values($1,$2,$3,$4,now()+($5::int*interval '1 minute'),$6,$7,$8,$9) returning id,session_code,expires_at`,[req.user.sub,d.subjectId,rows[0].section_name,code,d.durationMinutes,d.sectionId,d.classroomId,rows[0].faculty_id,d.verificationMode]);
 await client.query(`insert into attendance(student_id,subject_id,faculty_id,classroom_id,status) select id,$2,$3,$4,'absent' from students where academic_section_id=$1 on conflict(student_id,subject_id,attendance_date) do nothing`,[d.sectionId,d.subjectId,rows[0].faculty_id,d.classroomId]);
 await client.query("insert into notifications(user_id,title,body,type) select user_id,'Attendance is open',$2,'attendance' from students where academic_section_id=$1",[d.sectionId,'Your coordinator opened attendance for your class. Open the attendance screen before the session expires.']);
 await client.query('commit');res.status(201).json({session:inserted.rows[0]});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
attendanceSessionRouter.post('/check-in',allowRoles('student','student_coordinator'),async(req,res)=>{
 const parsed=z.object({code:z.string().trim().toUpperCase().regex(/^[A-F0-9]{10}$/)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({message:'Enter the 10-character session code shown by your coordinator.'});
 const client=await pool.connect();try{await client.query('begin');
 const {rows}=await client.query(`select a.*,s.id student_id from attendance_sessions a join students s on s.academic_section_id=a.academic_section_id where a.session_code=$1 and s.user_id=$2 and a.stopped_at is null and a.expires_at>now() and ${sessionResponsibility('a')} for update of a`,[parsed.data.code,req.user.sub]);
 if(!rows[0]){await client.query('rollback');return res.status(404).json({message:'Session expired, stopped, or not available to your class.'});}
 const a=rows[0];if(a.mobile_mode||a.verification_mode==='face_bluetooth'){await client.query('rollback');return res.status(403).json({message:'This class requires Bluetooth and verified face capture. Session codes cannot mark attendance.'});}await client.query('insert into attendance_session_entries(session_id,student_id) values($1,$2) on conflict do nothing',[a.id,a.student_id]);
 await client.query(`insert into attendance(student_id,subject_id,faculty_id,classroom_id,status,attendance_date) values($1,$2,$3,$4,'present',$5::timestamptz::date)
 on conflict(student_id,subject_id,attendance_date) do update set status='present',marked_at=now()`,[a.student_id,a.subject_id,a.faculty_id,a.classroom_id,a.starts_at]);
 await client.query('commit');res.json({message:'Attendance recorded.'});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
attendanceSessionRouter.get('/:id/participants',managers,async(req,res)=>{
 const {rows}=await pool.query(`select s.roll_number,u.full_name,case when e.student_id is null then 'Not checked in' else 'Present' end status
 from attendance_sessions a join students s on s.academic_section_id=a.academic_section_id join users u on u.id=s.user_id left join attendance_session_entries e on e.session_id=a.id and e.student_id=s.id
 where a.id=$1 and a.coordinator_user_id=$2 and ${sessionResponsibility('a')} order by s.roll_number`,[req.params.id,req.user.sub]);res.json({students:rows});
});
attendanceSessionRouter.post('/:id/stop',managers,async(req,res)=>{
 const {rowCount}=await pool.query('update attendance_sessions set stopped_at=now() where id=$1 and coordinator_user_id=$2 and stopped_at is null and not mobile_mode',[req.params.id,req.user.sub]);if(!rowCount)return res.status(404).json({message:'Active session not found.'});res.json({message:'Session stopped.'});
});
