import dotenv from 'dotenv';
import pg from 'pg';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE) });
const aliases = { A: '1', B: '2', C: '3', D: '4' };

await client.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('normalize-cse-sections'))");
  const department = (await client.query("select id from departments where lower(name) in ('computer science engineering','computer science & engineering','cse') order by case when name='Computer Science Engineering' then 0 else 1 end limit 1")).rows[0];
  if (!department) throw new Error('Computer Science Engineering department was not found.');
  let studentUpdates = 0, sectionUpdates = 0;
  for (const [letter, number] of Object.entries(aliases)) {
    const updatedStudents = await client.query('update students set section=$3 where department_id=$1 and upper(section)=$2', [department.id, letter, number]);
    studentUpdates += updatedStudents.rowCount;
    const alphabeticSections = await client.query('select id,year_number,semester_number,academic_year from academic_sections where department_id=$1 and upper(section_name)=$2 for update', [department.id, letter]);
    for (const source of alphabeticSections.rows) {
      const target = await client.query(`select id from academic_sections where department_id=$1 and year_number=$2 and semester_number=$3 and academic_year=$4 and section_name=$5 for update`, [department.id, source.year_number, source.semester_number, source.academic_year, number]);
      if (target.rowCount) {
        const targetId = target.rows[0].id;
        await client.query('update students set academic_section_id=$2,section=$3 where academic_section_id=$1', [source.id, targetId, number]);
        await client.query('update timetable set academic_section_id=$2 where academic_section_id=$1', [source.id, targetId]);
        await client.query('update attendance_sessions set academic_section_id=$2,section=$3 where academic_section_id=$1', [source.id, targetId, number]);
        await client.query('delete from academic_sections where id=$1', [source.id]);
      } else {
        await client.query('update academic_sections set section_name=$2 where id=$1', [source.id, number]);
        sectionUpdates++;
      }
    }
  }
  const { rows } = await client.query(`select section,count(*)::int total from students where department_id=$1 group by section order by section`, [department.id]);
  await client.query('commit');
  console.log(JSON.stringify({ studentUpdates, renamedAcademicSections: sectionUpdates, cseSections: rows }));
} catch (error) {
  await client.query('rollback');
  console.error(`Normalization rolled back: ${error.message}`);
  process.exitCode = 1;
} finally { await client.end(); }
