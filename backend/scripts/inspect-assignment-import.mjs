import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
import {effectiveFacultyAssignments} from '../src/services/teachingAssignments.js';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL),connectionTimeoutMillis:10000,query_timeout:15000});
try {
 await db.connect();
 const sections=(await db.query(`select x.id,x.section_name,x.year_number,x.semester_number,x.academic_year,d.name department,count(s.id)::int students from academic_sections x join departments d on d.id=x.department_id left join students s on s.academic_section_id=x.id where x.year_number=3 group by x.id,d.name order by d.name,x.section_name`)).rows;
 console.log(JSON.stringify({sections}));
 const assignments=(await db.query(`select distinct x.id section_id,x.section_name,x.academic_year,su.id subject_id,su.code,su.name,f.id faculty_id,u.full_name faculty from ${effectiveFacultyAssignments} a join academic_sections x on x.id=a.academic_section_id join subjects su on su.id=a.subject_id join faculty f on f.id=a.faculty_id join users u on u.id=f.user_id where x.year_number=3 and a.status='active' and (su.name ilike '%IRS%' or su.name ilike '%retriev%' or su.name ilike '%computer network%') order by x.section_name,su.code`)).rows;
 console.log(JSON.stringify({assignments}));
 console.log(JSON.stringify({sample:(await db.query(`select s.roll_number,s.section,s.academic_section_id,u.full_name from students s join users u on u.id=s.user_id where s.roll_number like '32510321%' or s.roll_number like '32410321013%' or u.full_name ~* '(vedha|eeli|elaprolu|g sri|gadepalli|galla|gampa|gangalla|ganji|garikipati|velamala|vempadapu|vempati|vennela)' order by s.roll_number`)).rows}));
} catch(e){console.error(e.code||e.message);process.exitCode=1;}finally{await db.end();}
