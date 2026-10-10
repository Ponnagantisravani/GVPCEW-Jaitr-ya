import {effectiveFacultyAssignments} from '../services/teachingAssignments.js';
import { Router } from '../utils/router.js';
import { pool } from '../config/db.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { z } from 'zod';
import { validDate } from './faculty.js';
export const studentRouter = Router();
studentRouter.use(requireAuth, allowRoles('student','student_coordinator'));
studentRouter.use(async (req,res,next)=>{
 try{const {rows}=await pool.query('select * from students where user_id=$1',[req.user.sub]);if(!rows[0])return res.status(404).json({message:'Student profile not found. Contact the administrator.'});req.student=rows[0];next();}catch(e){next(e);}
});
const subjectScope=`exists(select 1 from ${effectiveFacultyAssignments} fa where fa.subject_id=su.id and fa.academic_section_id=$2 and fa.status='active')`;
const assignmentScope=`a.academic_section_id=$2 and exists(select 1 from ${effectiveFacultyAssignments} fa where fa.subject_id=su.id and fa.faculty_id=a.faculty_id and fa.academic_section_id=$2 and fa.status='active')`;
studentRouter.get('/faculty',async(req,res)=>{
 const {rows}=await pool.query(`select distinct f.id,u.full_name,su.code,su.name subject from ${effectiveFacultyAssignments} t join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id join subjects su on su.id=t.subject_id where t.academic_section_id=$1 and t.status='active' order by u.full_name,su.code`,[req.student.academic_section_id]);
 res.json({faculty:rows});
});
studentRouter.get('/profile',async(req,res)=>{
 const {rows}=await pool.query(`select s.id,u.full_name,u.email,s.roll_number,s.section,s.academic_section_id,d.name department,
 x.year_number AS "year",x.semester_number AS semester,x.academic_year,s.face_enrollment_status,
 to_jsonb(s)->'profile_details' profile_details,
 jsonb_build_object('course',to_jsonb(s)->'profile_details'->>'course',
 'batch',to_jsonb(s)->'profile_details'->>'batch',
 'department_code',to_jsonb(s)->'profile_details'->>'department_code') id_details
 from students s join users u on u.id=s.user_id left join departments d on d.id=s.department_id left join academic_sections x on x.id=s.academic_section_id where s.id=$1`,[req.student.id]);
 res.json({profile:rows[0]});
});
studentRouter.get('/attendance',async(req,res)=>{
 const s=req.student;
 const {rows}=await pool.query(`select su.code,su.name,count(a.id)::int classes,
 count(a.id) filter(where a.status in ('present','late'))::int present,
 round(100.0*count(a.id) filter(where a.status in ('present','late'))/nullif(count(a.id),0),1) percentage
 from subjects su left join attendance a on a.subject_id=su.id and a.student_id=$1 where ${subjectScope} or a.id is not null group by su.id order by su.code`,[s.id,s.academic_section_id]);
 const classes=rows.reduce((sum,r)=>sum+r.classes,0),present=rows.reduce((sum,r)=>sum+r.present,0);
 res.json({overall:classes?Math.round(1000*present/classes)/10:0,subjects:rows});
});
studentRouter.get('/marks',async(req,res)=>{
 const {rows}=await pool.query(`select su.code,su.name,m.examination_type,m.score,m.maximum_score,
 round(100.0*m.score/nullif(m.maximum_score,0),2) percentage from marks m join subjects su on su.id=m.subject_id where m.student_id=$1 order by su.code,m.examination_type`,[req.student.id]);
 res.json({marks:rows,sgpa:null,cgpa:null});
});
studentRouter.get('/timetable',async(req,res)=>{
 const {rows}=await pool.query(`select t.*,su.code,su.name subject,u.full_name faculty,c.room_code classroom from timetable t join subjects su on su.id=t.subject_id join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id join classrooms c on c.id=t.classroom_id where t.academic_section_id=$1 and t.status='published' order by t.day_of_week,t.start_time`,[req.student.academic_section_id]);res.json({timetable:rows});
});
studentRouter.get('/assignments',async(req,res)=>{
 const s=req.student;
 const {rows}=await pool.query(`select a.id,a.title,a.description,a.deadline,su.code,su.name subject,
 case when x.id is not null then x.status when a.deadline<now() then 'late' else 'pending' end status
 from assignments a join subjects su on su.id=a.subject_id left join assignment_submissions x on x.assignment_id=a.id and x.student_id=$1 where ${assignmentScope} order by a.deadline`,[s.id,s.academic_section_id]);
 res.json({assignments:rows});
});
studentRouter.post('/assignments/:id/submit',async(req,res)=>{
 const parsed=z.object({url:z.string().url().max(2048).refine(value=>new URL(value).protocol==='https:')}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({message:'Enter a valid HTTPS link to your assignment.'});
 const s=req.student;const allowed=await pool.query(`select a.id from assignments a join subjects su on su.id=a.subject_id where a.id=$1 and ${assignmentScope}`,[req.params.id,s.academic_section_id]);
 if(!allowed.rowCount)return res.status(404).json({message:'Assignment not available to your class.'});
 await pool.query(`insert into assignment_submissions(assignment_id,student_id,submission_url,status)
 select id,$2,$3,case when deadline<now() then 'late' else 'submitted' end from assignments where id=$1
 on conflict(assignment_id,student_id) do update set submission_url=excluded.submission_url,submitted_at=now(),status=excluded.status`,[req.params.id,s.id,parsed.data.url]);
 res.json({message:'Assignment submitted.'});
});
studentRouter.get('/leave-requests',async(req,res)=>{
 const {rows}=await pool.query('select id,start_date,end_date,reason,status,reviewer_note,created_at,reviewed_at from leave_requests where student_id=$1 order by created_at desc',[req.student.id]);res.json({requests:rows});
});
studentRouter.post('/leave-requests',async(req,res)=>{
 const parsed=z.object({startDate:validDate,endDate:validDate,reason:z.string().trim().min(1).max(3000)}).refine(d=>d.endDate>=d.startDate).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({message:'Enter valid start/end dates and a reason. End date cannot precede start date.'});
 const d=parsed.data,client=await pool.connect();try{await client.query('begin');
 const {rows}=await client.query('insert into leave_requests(student_id,start_date,end_date,reason) values($1,$2,$3,$4) returning *',[req.student.id,d.startDate,d.endDate,d.reason]);
 await client.query(`insert into notifications(user_id,title,body,type,link) select f.user_id,'New student leave request',$2,'leave','/faculty-dashboard' from faculty f where exists(select 1 from timetable t where t.faculty_id=f.id and t.academic_section_id=$1 and t.status='published')`,[req.student.academic_section_id,'Leave requested from '+d.startDate+' to '+d.endDate+'.']);
 await client.query('commit');res.status(201).json({request:rows[0]});}catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
studentRouter.get('/dashboard',async(req,res)=>{
 const s=req.student;
 const [attendance,assignments,notices,events,notifications]=await Promise.all([
 pool.query(`select coalesce(round(100.0*count(*) filter(where status in ('present','late'))/nullif(count(*),0),1),0) percentage from attendance where student_id=$1`,[s.id]),
 pool.query(`select count(*)::int total from assignments a join subjects su on su.id=a.subject_id left join assignment_submissions x on x.assignment_id=a.id and x.student_id=$1 where x.id is null and a.deadline>=now() and ${assignmentScope}`,[s.id,s.academic_section_id]),
 pool.query(`select id,title,category,published_at from notices n where (expires_at is null or expires_at>now())
   and (target_academic_section_id is null or target_academic_section_id=$1) and (target_department_id is null or target_department_id=$2) order by published_at desc limit 4`,[s.academic_section_id,s.department_id]),
 pool.query('select id,title,category,starts_at,location from events where starts_at>now() order by starts_at limit 4'),
 pool.query('select id,title,body,type,link,created_at,read_at from notifications where user_id=$1 order by created_at desc limit 100',[req.user.sub])]);
 res.json({attendance:Number(attendance.rows[0].percentage),pendingAssignments:assignments.rows[0].total,notices:notices.rows,events:events.rows,notifications:notifications.rows});
});
