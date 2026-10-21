import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';

assert(['localhost','127.0.0.1','[::1]'].includes(new URL(env.databaseUrl).hostname), 'This attendance demo setup is restricted to the local database.');
const c = await pool.connect();
try {
  await c.query('begin');
  await c.query("select pg_advisory_xact_lock(hashtext('section3-subject-attendance-demo'))");
  const section = (await c.query(`select x.id,x.year_number,x.semester_number,x.department_id
    from academic_sections x join departments d on d.id=x.department_id
    where x.id='b5577fe4-efba-4a50-a0de-c65efc659ec5'
      and lower(d.name) like '%computer science%'
      and exists(select 1 from students s where s.academic_section_id=x.id)`)).rows[0];
  assert(section, 'The populated CSE Year 2 Section 3 demo class was not found.');
  const subjects = (await c.query(`select distinct s.id,s.code,s.name,t.faculty_id,coalesce(u.email,'faculty1@gvpcew.ac.in') faculty_email
    from timetable t join subjects s on s.id=t.subject_id join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id
    where t.academic_section_id=$1 and t.status='published'
      and t.day_of_week=extract(dow from clock_timestamp() at time zone 'Asia/Kolkata')
      and s.department_id=$2 order by s.code`, [section.id,section.department_id])).rows;
  assert(subjects.length >= 5, `Expected at least five published subjects today, found ${subjects.length}.`);
  for (const subject of subjects) {
    const kind = /lab/i.test(`${subject.code} ${subject.name}`) ? 'lab' : 'theory';
    const displayName = subject.code === 'CN (Dr.PMR)' ? 'Computer Networks (Local demo)' : `${subject.name} (Local demo)`;
    await c.query(`insert into subject_attendance_subjects(subject_id,dept,year,semester,kind,faculty_email,display_name)
      values($1,'CSE',$2,$3,$4,$5,$6)
      on conflict(subject_id) do update set dept=excluded.dept,year=excluded.year,semester=excluded.semester,
        kind=excluded.kind,faculty_email=excluded.faculty_email,display_name=excluded.display_name`,
      [subject.id,section.year_number,section.semester_number,kind,subject.faculty_email,displayName]);
    await c.query(`insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number)
      values($1,$2,$3,$4) on conflict(academic_section_id,subject_id) do update
      set subject_type=excluded.subject_type,semester_number=excluded.semester_number`,
      [section.id,subject.id,kind,section.semester_number]);
  }
  await c.query('commit');
  console.log(JSON.stringify({section:'CSE Year 2 · Section 3',subjects:subjects.map(s=>s.name),availableToday:true}));
} catch (error) {
  await c.query('rollback');
  throw error;
} finally {
  c.release();
  await pool.end();
}
