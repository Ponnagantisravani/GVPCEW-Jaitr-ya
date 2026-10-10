import {effectiveFacultyAssignments} from '../services/teachingAssignments.js';
import { Router } from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
export const facultyRouter=Router();
facultyRouter.use(requireAuth,allowRoles('faculty'));
export const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value);return !isNaN(d)&&d.toISOString().slice(0,10)===value;});
const visibleStudent=`exists(select 1 from ${effectiveFacultyAssignments} fa where fa.faculty_id=f.id and fa.academic_section_id=s.academic_section_id and fa.status='active')`;
const studentInSubject=parameter=>`exists(select 1 from ${effectiveFacultyAssignments} fa where fa.faculty_id=f.id and fa.academic_section_id=s.academic_section_id and fa.subject_id=${parameter} and fa.status='active')`;
const assignedSubject=`exists(select 1 from ${effectiveFacultyAssignments} fa where fa.faculty_id=f.id and fa.subject_id=su.id and fa.status='active')`;
async function context(userId){const {rows}=await pool.query('select f.*,u.full_name,u.email,d.name department from faculty f join users u on u.id=f.user_id left join departments d on d.id=f.department_id where f.user_id=$1',[userId]);return rows[0];}
facultyRouter.get('/workspace',async(req,res)=>{
 const faculty=await context(req.user.sub);
 if(!faculty)return res.status(404).json({message:'Your faculty profile has not been assigned. Contact the administrator.'});
 const [subjects,students,rooms,assignments,marks,requests]=await Promise.all([
 pool.query(`select distinct su.id,su.code,su.name from subjects su join faculty f on f.id=$1 where ${assignedSubject} order by su.code`,[faculty.id]),
 pool.query(`select s.id,s.roll_number,s.academic_section_id,concat('Year ',x.year_number,' / Sem ',x.semester_number,' / ',s.section,' / ',x.academic_year) section,u.full_name,d.name department,array(select distinct fa.subject_id from ${effectiveFacultyAssignments} fa where fa.faculty_id=f.id and fa.academic_section_id=s.academic_section_id and fa.status='active') subject_ids from students s join users u on u.id=s.user_id left join departments d on d.id=s.department_id join academic_sections x on x.id=s.academic_section_id join faculty f on f.id=$1 where ${visibleStudent} order by s.roll_number`,[faculty.id]),
 pool.query('select id,room_code from classrooms where active order by room_code'),
 pool.query(`select a.*,su.name subject,x.section_name,x.year_number,x.semester_number from assignments a join subjects su on su.id=a.subject_id join academic_sections x on x.id=a.academic_section_id join ${effectiveFacultyAssignments} fa on fa.faculty_id=a.faculty_id and fa.subject_id=a.subject_id and fa.academic_section_id=a.academic_section_id and fa.status='active' where a.faculty_id=$1 order by a.deadline desc`,[faculty.id]),
 pool.query(`select m.* from marks m join students s on s.id=m.student_id join faculty f on f.id=$1 where m.created_by=f.id and ${studentInSubject('m.subject_id')} order by m.updated_at desc`,[faculty.id]),
 pool.query('select * from faculty_requests where faculty_id=$1 order by created_at desc',[faculty.id])]);
 const classAssignments=(await pool.query(`select fa.id,fa.subject_id,fa.academic_section_id section_id,su.code,su.name subject,d.name department,x.year_number,x.semester_number,x.section_name,x.academic_year,(select count(*)::int from students where academic_section_id=x.id) students from ${effectiveFacultyAssignments} fa join subjects su on su.id=fa.subject_id join academic_sections x on x.id=fa.academic_section_id join departments d on d.id=x.department_id where fa.faculty_id=$1 and fa.status='active' order by d.name,x.year_number,x.section_name,su.code`,[faculty.id])).rows;
 res.json({profile:faculty,subjects:subjects.rows,students:students.rows,classrooms:rooms.rows,assignments:assignments.rows,marks:marks.rows,requests:requests.rows,classAssignments});
});
facultyRouter.get('/announcement-targets',async(req,res)=>{
 const faculty=await context(req.user.sub);
 if(!faculty)return res.status(404).json({message:'Your faculty profile has not been assigned. Contact the administrator.'});
 const {rows}=await pool.query(`select distinct d.id department_id,d.name department,x.id section_id,
   x.year_number,x.semester_number,x.section_name,x.academic_year
  from ${effectiveFacultyAssignments} t join academic_sections x on x.id=t.academic_section_id
  join departments d on d.id=x.department_id
  where t.faculty_id=$1 and t.status='active'
  order by d.name,x.academic_year desc,x.year_number,x.semester_number,x.section_name`,[faculty.id]);
 res.json({targets:rows});
});
async function authorize(client,userId,subjectId,sectionId,studentIds=[]){
 if(!sectionId&&studentIds.length){const inferred=await client.query('select (array_agg(distinct academic_section_id))[1]::text section_id,count(distinct academic_section_id)::int sections from students where id=any($1::uuid[])',[studentIds]);if(inferred.rows[0]?.sections===1)sectionId=inferred.rows[0].section_id;}
 const subject=await client.query(`select f.id from faculty f where f.user_id=$1 and exists(select 1 from ${effectiveFacultyAssignments} fa where fa.faculty_id=f.id and fa.subject_id=$2 and ($3::uuid is null or fa.academic_section_id=$3) and fa.status='active')`,[userId,subjectId,sectionId||null]);
 if(!subject.rowCount)return null;
 if(studentIds.length){const visible=await client.query(`select s.id from students s where s.id=any($1::uuid[]) and s.academic_section_id=$2`,[studentIds,sectionId]);
 if(visible.rowCount!==new Set(studentIds).size)return null;}
 return subject.rows[0].id;
}
facultyRouter.get('/attendance-register',async(req,res)=>{
 const parsed=z.object({subjectId:z.string().uuid(),sectionId:z.string().uuid().optional(),month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).safeParse(req.query);
 if(!parsed.success)return res.status(400).json({message:'Choose a subject and month.'});
 const fid=await authorize(pool,req.user.sub,parsed.data.subjectId,parsed.data.sectionId);
 if(!fid)return res.status(403).json({message:'This subject is not assigned to you.'});
 const {rows}=await pool.query(`select a.student_id,to_char(a.attendance_date,'YYYY-MM-DD') date,a.status
 from attendance a join students s on s.id=a.student_id join faculty f on f.id=$3
 where a.subject_id=$1 and ($4::uuid is null or s.academic_section_id=$4) and a.attendance_date >= $2::date and a.attendance_date < ($2::date+interval '1 month')
 and ${studentInSubject('$1')} order by a.attendance_date,s.roll_number`,[parsed.data.subjectId,parsed.data.month+'-01',fid,parsed.data.sectionId]);
 res.json({attendance:rows});
});
facultyRouter.get('/attendance',async(req,res)=>{
 const parsed=z.object({subjectId:z.string().uuid(),sectionId:z.string().uuid(),date:validDate}).safeParse(req.query);
 if(!parsed.success)return res.status(400).json({message:'Choose a subject and valid date.'});
 const fid=await authorize(pool,req.user.sub,parsed.data.subjectId,parsed.data.sectionId);
 if(!fid)return res.status(403).json({message:'This subject is not assigned to you.'});
 const {rows}=await pool.query(`select a.student_id,a.status,a.classroom_id from attendance a join students s on s.id=a.student_id join faculty f on f.id=$3 where a.subject_id=$1 and a.attendance_date=$2 and s.academic_section_id=$4 and ${studentInSubject('$1')}`,[parsed.data.subjectId,parsed.data.date,fid,parsed.data.sectionId]);res.json({attendance:rows});
});
const attendanceSchema=z.object({subjectId:z.string().uuid(),sectionId:z.string().uuid().optional(),classroomId:z.string().uuid(),date:validDate,entries:z.array(z.object({studentId:z.string().uuid(),status:z.enum(['present','absent','late'])})).min(1).max(500)});
facultyRouter.post('/attendance',async(req,res)=>{
 const parsed=attendanceSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Choose subject, classroom, date and student attendance.'});
 const d=parsed.data,client=await pool.connect();
 try{await client.query('begin');const fid=await authorize(client,req.user.sub,d.subjectId,d.sectionId,d.entries.map(x=>x.studentId));
 if(!fid){await client.query('rollback');return res.status(403).json({message:'You can mark only your assigned students and subjects.'});}
 for(const row of d.entries){const saved=await client.query(`insert into attendance(student_id,subject_id,faculty_id,classroom_id,attendance_date,status) values($1,$2,$3,$4,$5,$6)
 on conflict(student_id,subject_id,attendance_date) do update set status=excluded.status,faculty_id=excluded.faculty_id,classroom_id=excluded.classroom_id,marked_at=now() returning id`,[row.studentId,d.subjectId,fid,d.classroomId,d.date,row.status]);
 await client.query("insert into attendance_logs(attendance_id,event_type,payload) values($1,'faculty_update',$2)",[saved.rows[0].id,JSON.stringify({actor:req.user.sub,status:row.status})]);}
 await client.query('commit');res.json({message:'Attendance saved.',saved:d.entries.length});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
const marksSchema=z.object({subjectId:z.string().uuid(),sectionId:z.string().uuid().optional(),type:z.enum(['assignment','internal','mid_1','mid_2','semester']),maximum:z.number().positive().max(1000),entries:z.array(z.object({studentId:z.string().uuid(),score:z.number().nonnegative()})).min(1).max(500)}).refine(d=>d.entries.every(x=>x.score<=d.maximum));
facultyRouter.post('/marks',async(req,res)=>{
 const parsed=marksSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Scores must be between zero and the maximum mark.'});
 const d=parsed.data,client=await pool.connect();
 try{await client.query('begin');const fid=await authorize(client,req.user.sub,d.subjectId,d.sectionId,d.entries.map(x=>x.studentId));
 if(!fid){await client.query('rollback');return res.status(403).json({message:'These students or this subject are not assigned to you.'});}
 for(const row of d.entries)await client.query(`insert into marks(student_id,subject_id,examination_type,score,maximum_score,created_by) values($1,$2,$3,$4,$5,$6)
 on conflict(student_id,subject_id,examination_type) do update set score=excluded.score,maximum_score=excluded.maximum_score,created_by=excluded.created_by,assignment_scores=null,updated_at=now()`,[row.studentId,d.subjectId,d.type,row.score,d.maximum,fid]);
 await client.query('commit');res.json({message:'Marks saved.'});
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
});
const assignmentSchema=z.object({subjectId:z.string().uuid(),sectionId:z.string().uuid(),title:z.string().trim().min(1).max(200),description:z.string().trim().max(10000),deadline:z.string().datetime()});
facultyRouter.post('/assignments',async(req,res)=>{
 const parsed=assignmentSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Enter a title, subject and valid deadline.'});
 const d=parsed.data,fid=await authorize(pool,req.user.sub,d.subjectId,d.sectionId);if(!fid)return res.status(403).json({message:'This section and subject are not assigned to you.'});
 const {rows}=await pool.query('insert into assignments(subject_id,faculty_id,academic_section_id,title,description,deadline) values($1,$2,$3,$4,$5,$6) returning *',[d.subjectId,fid,d.sectionId,d.title,d.description,d.deadline]);res.status(201).json({assignment:rows[0]});
});
facultyRouter.get('/assignments/:id/submissions',async(req,res)=>{
 const {rows}=await pool.query(`select x.*,u.full_name,s.roll_number from assignment_submissions x join assignments a on a.id=x.assignment_id join faculty f on f.id=a.faculty_id join ${effectiveFacultyAssignments} fa on fa.faculty_id=a.faculty_id and fa.subject_id=a.subject_id and fa.academic_section_id=a.academic_section_id and fa.status='active' join students s on s.id=x.student_id and s.academic_section_id=a.academic_section_id join users u on u.id=s.user_id where a.id=$1 and f.user_id=$2 order by x.submitted_at`,[req.params.id,req.user.sub]);res.json({submissions:rows});
});
facultyRouter.delete('/assignments/:id',async(req,res)=>{
 const result=await pool.query(`delete from assignments a where a.id=$1 and a.faculty_id=(select id from faculty where user_id=$2) and exists(select 1 from ${effectiveFacultyAssignments} fa where fa.faculty_id=a.faculty_id and fa.subject_id=a.subject_id and fa.academic_section_id=a.academic_section_id and fa.status='active')`,[req.params.id,req.user.sub]);
 if(!result.rowCount)return res.status(404).json({message:'Assignment not found.'});res.status(204).end();
});
facultyRouter.post('/requests',async(req,res)=>{
 const parsed=z.object({kind:z.enum(['correction','substitution']),details:z.string().trim().min(10).max(4000)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({message:'Describe your correction or substitution request (at least 10 characters).'});
 const f=await context(req.user.sub);if(!f)return res.status(404).json({message:'Faculty profile not found.'});
 const {rows}=await pool.query('insert into faculty_requests(faculty_id,kind,details) values($1,$2,$3) returning *',[f.id,parsed.data.kind,parsed.data.details]);res.status(201).json({request:rows[0]});
});
