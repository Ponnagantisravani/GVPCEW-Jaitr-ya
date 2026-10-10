import {pool} from '../config/db.js';
import {manageDepartmentScope,managementScope,sectionScope,teachingScope} from './portalScope.js';
export function forbidden(message='This academic scope is not assigned to your account.') { return Object.assign(new Error(message),{status:403}); }
export async function academicAccess(req,db=pool){
 const role=req.user.activeRole||req.user.role||(req.user.roles||[])[0];
 if(role==='admin')return {institutionWide:true,departmentIds:[]};
 if(role!=='academic_coordinator')throw forbidden();
 const {rows}=await db.query(`select exists(select 1 from academic_institution_access where user_id=$1) institution_wide,
 array(select department_id from academic_coordinator_departments where user_id=$1) department_ids`,[req.user.sub]);
 return {institutionWide:rows[0].institution_wide,departmentIds:rows[0].department_ids};
}
export async function requireDepartment(req,departmentId,db=pool){
 const access=await academicAccess(req,db);
 if(!departmentId||(!access.institutionWide&&!access.departmentIds.includes(departmentId)))throw forbidden();
 return access;
}
export async function allowedSections(req,db=pool){
 const role=req.user.activeRole||req.user.role||(req.user.roles||[])[0];
 const {rows}=await db.query(`select x.id,x.department_id,d.name department,x.year_number,x.semester_number,x.section_name,x.academic_year
 from academic_sections x join departments d on d.id=x.department_id
 where ${manageDepartmentScope('x.department_id')} or ($2='faculty' and ${teachingScope('x.id')}) or ${sectionScope('x.id')}
 order by d.name,x.academic_year,x.year_number,x.section_name`,[req.user.sub,role]);
 return rows;
}
export async function requireSections(req,ids,db=pool){
 if(!ids.length)throw forbidden('Choose at least one authorized class.');
 const allowed=new Set((await allowedSections(req,db)).map(s=>s.id));
 if(ids.some(id=>!allowed.has(id)))throw forbidden();
}
export async function contextFor(req,db=pool){
 const sections=await allowedSections(req,db);
 const [student,faculty]=await Promise.all([
 db.query(`select s.id,s.roll_number,s.department_id,s.academic_section_id,x.year_number,x.semester_number,x.section_name,x.academic_year,d.name department from students s left join academic_sections x on x.id=s.academic_section_id left join departments d on d.id=s.department_id where s.user_id=$1`,[req.user.sub]),
 db.query('select id,employee_code,department_id from faculty where user_id=$1',[req.user.sub])]);
 const ownDepartment=req.user.activeRole==='faculty'?faculty.rows[0]?.department_id:student.rows[0]?.department_id;
 const access=['admin','academic_coordinator'].includes(req.user.activeRole)?await academicAccess(req,db):{institutionWide:false,departmentIds:[...new Set([...sections.map(s=>s.department_id),...(ownDepartment?[ownDepartment]:[])])]};
 const departments=await db.query('select id,name from departments where $1 or id=any($2::uuid[]) order by name',[access.institutionWide,access.departmentIds]);
 return {role:req.user.activeRole,student:['student','student_coordinator'].includes(req.user.activeRole)?student.rows[0]||null:null,
 faculty:req.user.activeRole==='faculty'?faculty.rows[0]||null:null,sections,departments:departments.rows,institutionWide:access.institutionWide};
}
