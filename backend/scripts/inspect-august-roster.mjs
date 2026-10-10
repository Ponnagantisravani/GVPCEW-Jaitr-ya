import {pool} from '../src/config/db.js';
try {
 console.log(JSON.stringify((await pool.query(`select s.roll_number,u.full_name,s.academic_section_id from students s join users u on u.id=s.user_id where s.roll_number like '325103210%' order by s.roll_number`)).rows));
 console.log(JSON.stringify((await pool.query(`select x.id,x.year_number,x.semester_number,x.section_name,x.academic_year from academic_sections x join departments d on d.id=x.department_id where d.name='Computer Science Engineering' and x.year_number=3`)).rows));
}finally{await pool.end();}
