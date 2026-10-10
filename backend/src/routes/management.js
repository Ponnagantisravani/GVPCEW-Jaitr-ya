import {Router} from '../utils/router.js';
import {pool} from '../config/db.js';
import {requireAuth,allowRoles} from '../middleware/auth.js';
import {z} from 'zod';
import {academicAccess,requireDepartment,forbidden} from '../services/academicAccess.js';
export const managementRouter=Router();
managementRouter.use(requireAuth,allowRoles('admin','academic_coordinator'));
managementRouter.get('/catalog',async(req,res)=>{
 const access=await academicAccess(req),args=[access.institutionWide,access.departmentIds];
 const [departments,subjects,faculty,classrooms,sections,students,requests,sectionSubjects]=await Promise.all([
 pool.query('select * from departments where $1 or id=any($2::uuid[]) order by name',args),pool.query('select * from subjects where $1 or department_id=any($2::uuid[]) order by code',args),
 pool.query('select f.*,u.full_name from faculty f join users u on u.id=f.user_id where $1 or f.department_id=any($2::uuid[]) order by u.full_name',args),
 pool.query('select * from classrooms order by room_code'),
 pool.query(`select x.*,d.name department,(select count(*)::int from students where academic_section_id=x.id) students from academic_sections x join departments d on d.id=x.department_id where $1 or x.department_id=any($2::uuid[]) order by d.name,x.year_number,x.section_name`,args),
 pool.query('select s.id,s.roll_number,s.academic_section_id,u.full_name from students s join users u on u.id=s.user_id where $1 or s.department_id=any($2::uuid[]) order by s.roll_number',args),
 pool.query(`select r.*,u.full_name faculty from faculty_requests r join faculty f on f.id=r.faculty_id join users u on u.id=f.user_id where $1 or f.department_id=any($2::uuid[]) order by r.created_at desc`,args),
 pool.query(`select ss.id,ss.academic_section_id section_id,ss.subject_id,ss.subject_type,ss.credits,ss.semester_number,su.code,su.name from section_subjects ss join academic_sections x on x.id=ss.academic_section_id join subjects su on su.id=ss.subject_id where $1 or x.department_id=any($2::uuid[]) order by su.code`,args)]);
 res.json({departments:departments.rows,subjects:subjects.rows,faculty:faculty.rows,classrooms:classrooms.rows,sections:sections.rows,students:students.rows,requests:requests.rows,sectionSubjects:sectionSubjects.rows});
});
const sectionSubjectSchema=z.object({name:z.string().trim().min(2).max(200),code:z.string().trim().min(1).max(40),subjectType:z.enum(['theory','lab','elective','project','other']).default('theory'),credits:z.number().nonnegative().max(99).nullable().optional(),semesterNumber:z.number().int().min(1).max(8).optional()});
managementRouter.get('/sections/:id/subjects',async(req,res)=>{const section=await pool.query('select * from academic_sections where id=$1',[req.params.id]);if(!section.rows[0])return res.status(404).json({message:'Section not found.'});await requireDepartment(req,section.rows[0].department_id);const {rows}=await pool.query(`select ss.*,su.code,su.name from section_subjects ss join subjects su on su.id=ss.subject_id where ss.academic_section_id=$1 order by su.code`,[section.rows[0].id]);res.json({subjects:rows});});
managementRouter.post('/sections/:id/subjects',async(req,res)=>{const parsed=sectionSubjectSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Enter a valid subject name, code, type, credits, and semester.'});const client=await pool.connect();try{await client.query('begin');const section=await client.query('select * from academic_sections where id=$1',[req.params.id]);if(!section.rows[0])return res.status(404).json({message:'Section not found.'});const x=section.rows[0];await requireDepartment(req,x.department_id,client);const d=parsed.data;let subject=(await client.query('select id,department_id from subjects where lower(code)=lower($1)',[d.code])).rows[0];if(subject&&subject.department_id!==x.department_id)return res.status(409).json({message:'This subject code is already used by another department.'});if(!subject)subject=(await client.query('insert into subjects(department_id,code,name) values($1,$2,$3) returning id,department_id',[x.department_id,d.code,d.name])).rows[0];await client.query('insert into section_subjects(academic_section_id,subject_id,subject_type,credits,semester_number,created_by) values($1,$2,$3,$4,$5,$6)',[x.id,subject.id,d.subjectType,d.credits??null,d.semesterNumber||x.semester_number,req.user.sub]);await client.query('commit');res.status(201).json({message:'Subject added to this section.'});}catch(e){await client.query('rollback');if(e.code==='23505')return res.status(409).json({message:'This subject already belongs to the selected section.'});throw e;}finally{client.release();}});
const schemas={
 departments:z.object({name:z.string().trim().min(2).max(120)}),
 subjects:z.object({code:z.string().trim().min(1).max(40),name:z.string().trim().min(2).max(200),department_id:z.string().uuid(),faculty_id:z.string().uuid().nullable()}),
 classrooms:z.object({room_code:z.string().trim().min(1).max(40),building_name:z.string().trim().max(100),room_name:z.string().trim().min(1).max(100)}),
 sections:z.object({department_id:z.string().uuid(),year_number:z.number().int().min(1).max(4),semester_number:z.number().int().min(1).max(8),section_name:z.string().trim().min(1).max(20),academic_year:z.string().trim().min(4).max(30)})
};
managementRouter.post('/catalog/:type',async(req,res)=>{
 const type=req.params.type,schema=schemas[type];if(!schema)return res.status(400).json({message:'Unknown catalog.'});
 const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Complete all required catalog fields with valid values.'});
 const access=await academicAccess(req);
 if(['departments','classrooms'].includes(type)&&!access.institutionWide)throw forbidden('Only institution-wide administrators can create departments or rooms.');
 if(parsed.data.department_id)await requireDepartment(req,parsed.data.department_id);
 if(parsed.data.faculty_id){const assigned=await pool.query('select department_id from faculty where id=$1',[parsed.data.faculty_id]);if(!assigned.rows[0])throw forbidden();await requireDepartment(req,assigned.rows[0].department_id);}
 const keys=Object.keys(parsed.data),table=type==='sections'?'academic_sections':type;
 const {rows}=await pool.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(parsed.data));res.status(201).json({record:rows[0]});
});
managementRouter.patch('/subjects/:id',async(req,res)=>{
 const parsed=z.object({facultyId:z.string().uuid().nullable()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Choose a faculty member.'});
 const original=await pool.query('select department_id from subjects where id=$1',[req.params.id]);if(!original.rows[0])throw forbidden();await requireDepartment(req,original.rows[0].department_id);
 if(parsed.data.facultyId){const faculty=await pool.query('select department_id from faculty where id=$1',[parsed.data.facultyId]);if(!faculty.rows[0])throw forbidden();await requireDepartment(req,faculty.rows[0].department_id);}
 const {rowCount}=await pool.query('update subjects set faculty_id=$2 where id=$1',[req.params.id,parsed.data.facultyId]);if(!rowCount)return res.status(404).json({message:'Subject not found.'});res.json({message:'Faculty assignment updated.'});
});
managementRouter.post('/sections/:id/students',allowRoles('admin'),async(req,res)=>{
 const parsed=z.object({studentIds:z.array(z.string().uuid()).min(1).max(500)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Choose at least one student.'});
 const {rows}=await pool.query('select * from academic_sections where id=$1',[req.params.id]);if(!rows[0])return res.status(404).json({message:'Section not found.'});
 const section=rows[0];const {rowCount}=await pool.query('update students set academic_section_id=$1,department_id=$2,section=$3 where id=any($4::uuid[])',[section.id,section.department_id,section.section_name,parsed.data.studentIds]);
 res.json({assigned:rowCount});
});
managementRouter.get('/reports',async(req,res)=>{
 const access=await academicAccess(req);
 const {rows}=await pool.query(`select d.name department,
 (select count(*)::int from students s where s.department_id=d.id) students,
 (select count(*)::int from faculty f where f.department_id=d.id) faculty,
 (select count(*)::int from subjects s where s.department_id=d.id) subjects,
 (select round(100.0*count(*) filter(where a.status in ('present','late'))/nullif(count(*),0),1) from attendance a join students s on s.id=a.student_id where s.department_id=d.id) attendance,
 (select round(avg(100.0*m.score/nullif(m.maximum_score,0)),1) from marks m join students s on s.id=m.student_id where s.department_id=d.id) marks
 from departments d where $1 or d.id=any($2::uuid[]) order by d.name`,[access.institutionWide,access.departmentIds]);res.json({departments:rows});
});
managementRouter.patch('/requests/:id',async(req,res)=>{
 const parsed=z.object({status:z.enum(['approved','rejected']),note:z.string().trim().max(2000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({message:'Choose a decision and valid note.'});
 const access=await academicAccess(req);
 const {rows}=await pool.query(`update faculty_requests set status=$2,reviewer_note=$3,reviewed_by=$4 where id=$1 and status='pending' and exists(select 1 from faculty f where f.id=faculty_requests.faculty_id and ($5 or f.department_id=any($6::uuid[]))) returning *`,[req.params.id,parsed.data.status,parsed.data.note,req.user.sub,access.institutionWide,access.departmentIds]);
 if(!rows[0])return res.status(409).json({message:'Request already reviewed or unavailable.'});res.json({request:rows[0]});
});
