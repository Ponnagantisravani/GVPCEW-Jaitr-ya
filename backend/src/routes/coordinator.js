import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {allowedSections} from '../services/academicAccess.js';
export const coordinatorRouter=Router();
coordinatorRouter.use(requireAuth,allowRoles('student_coordinator'));
coordinatorRouter.get('/workspace',async(req,res)=>{
 const sections=await allowedSections(req),ids=sections.map(s=>s.id);
 const [students,attendance,marks,assignments,timetable]=await Promise.all([
 pool.query(`select s.id,u.full_name,s.roll_number,s.academic_section_id from students s join users u on u.id=s.user_id where s.academic_section_id=any($1::uuid[]) order by s.roll_number`,[ids]),
 pool.query(`select s.id student_id,s.roll_number,u.full_name,s.academic_section_id,su.code,su.name subject,count(*)::int classes,count(*) filter(where a.status='present')::int present,round(100.0*count(*) filter(where a.status='present')/nullif(count(*),0),1) percentage from students s join users u on u.id=s.user_id join attendance a on a.student_id=s.id join subjects su on su.id=a.subject_id where s.academic_section_id=any($1::uuid[]) group by s.id,u.full_name,su.id order by s.roll_number,su.code`,[ids]),
 pool.query(`select s.id student_id,s.roll_number,u.full_name,s.academic_section_id,su.code,su.name subject,m.examination_type,m.score,m.maximum_score from students s join users u on u.id=s.user_id join marks m on m.student_id=s.id join subjects su on su.id=m.subject_id where s.academic_section_id=any($1::uuid[]) order by s.roll_number,su.code`,[ids]),
 pool.query(`select a.id,a.title,a.description,a.deadline,su.code,su.name subject,array_agg(distinct t.academic_section_id) academic_section_ids from assignments a join subjects su on su.id=a.subject_id join timetable t on t.subject_id=a.subject_id and t.faculty_id=a.faculty_id and t.status='published' where t.academic_section_id=any($1::uuid[]) group by a.id,su.id order by a.deadline desc`,[ids]),
 pool.query(`select t.id,t.academic_section_id,t.day_of_week,t.start_time,t.end_time,su.code,su.name subject,u.full_name faculty,c.room_code classroom from timetable t join subjects su on su.id=t.subject_id join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id join classrooms c on c.id=t.classroom_id where t.status='published' and t.academic_section_id=any($1::uuid[]) order by t.day_of_week,t.start_time`,[ids])]);
 res.json({sections,students:students.rows,attendance:attendance.rows,marks:marks.rows,assignments:assignments.rows,timetable:timetable.rows});
});
coordinatorRouter.get('/students/:id',async(req,res)=>{
 const ids=(await allowedSections(req)).map(s=>s.id);
 const {rows}=await pool.query(`select s.id,u.full_name,s.roll_number,s.academic_section_id,d.name department,x.year_number,x.semester_number,x.section_name,x.academic_year from students s join users u on u.id=s.user_id join academic_sections x on x.id=s.academic_section_id join departments d on d.id=x.department_id where s.id=$1 and s.academic_section_id=any($2::uuid[])`,[req.params.id,ids]);
 if(!rows.length)return res.status(404).json({message:'Student not found in your assigned classes.'});
 res.json({student:rows[0]});
});
