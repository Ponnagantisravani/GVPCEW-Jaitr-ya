import {pool} from '../src/config/db.js';
const client=await pool.connect();
try {
  await client.query('begin');
  const result=await client.query(`insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number)
    select distinct x.id,t.subject_id,'other',x.semester_number
    from timetable t join academic_sections x on x.id=t.academic_section_id
    join subjects su on su.id=t.subject_id and su.department_id=x.department_id
    where t.academic_year=x.academic_year
    on conflict(academic_section_id,subject_id) do nothing`);
  await client.query('commit');
  console.log(`Linked ${result.rowCount} existing timetable subjects to their sections.`);
} catch(error) {
  await client.query('rollback');
  console.error(error.message);process.exitCode=1;
} finally {client.release();await pool.end();}
