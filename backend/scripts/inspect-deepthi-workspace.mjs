import {pool} from '../src/config/db.js';
import {effectiveFacultyAssignments} from '../src/services/teachingAssignments.js';
try {
 const profiles=(await pool.query(`select f.id,f.employee_code,u.id user_id,u.full_name,u.email
 from faculty f join users u on u.id=f.user_id where u.full_name ilike '%deepthi%' or u.email ilike '%deepthi%'`)).rows;
 console.log(JSON.stringify({profiles},null,2));
 const ids=profiles.map(f=>f.id);
 const assignments=(await pool.query(`select fa.id,fa.faculty_id,su.code,su.name,fa.status,x.id section_id,x.section_name,x.year_number,x.academic_year
 from faculty_section_assignments fa join subjects su on su.id=fa.subject_id join academic_sections x on x.id=fa.academic_section_id where fa.faculty_id=any($1::uuid[])`,[ids])).rows;
 const effective=(await pool.query(`select fa.faculty_id,su.code,su.name,x.section_name,x.year_number from ${effectiveFacultyAssignments} fa join subjects su on su.id=fa.subject_id join academic_sections x on x.id=fa.academic_section_id where fa.faculty_id=any($1::uuid[])`,[ids])).rows;
 console.log(JSON.stringify({assignments,effective},null,2));
}catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await pool.end();}
