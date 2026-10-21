import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';

assert(['localhost','127.0.0.1','[::1]'].includes(new URL(env.databaseUrl).hostname), 'Sunday demo is restricted to the local database.');
const client = await pool.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('sunday-section3-attendance-demo'))");
  const section = (await client.query(`select x.id,x.academic_year,x.department_id
    from academic_sections x join departments d on d.id=x.department_id
    where x.year_number=2 and x.section_name='3' and x.academic_year='2025-2026'
      and lower(d.name) like '%computer science%'
      and exists(select 1 from students s where s.academic_section_id=x.id)
    order by x.semester_number desc limit 1`)).rows[0];
  assert(section, 'CSE Year 2 Section 3 with enrolled students was not found.');

  const subject = (await client.query("select id,name from subjects where code='AI (MA)' and department_id=$1", [section.department_id])).rows[0];
  assert(subject, 'AI (MA) subject was not found for the selected section.');
  const faculty = (await client.query(`select f.id from faculty f join users u on u.id=f.user_id
    where lower(u.email)='aswini@gvpcew.ac.in' and f.department_id=$1`, [section.department_id])).rows[0];
  assert(faculty, 'Registered institutional account for Aswini was not found.');
  const room = (await client.query(`insert into classrooms(room_code,building_name,room_name,active)
    values('LOCAL-SUNDAY-CSE2-SEC3','Local attendance demo','Sunday attendance test',true)
    on conflict(room_code) do update set active=true returning id`)).rows[0];

  const existing = await client.query(`select id,subject_id,faculty_id,classroom_id from timetable
    where academic_section_id=$1 and day_of_week=0 and start_time='09:00'::time and end_time='09:50'::time`, [section.id]);
  let id;
  if (existing.rowCount) {
    const row = existing.rows[0];
    assert(existing.rowCount === 1 && row.subject_id === subject.id && row.faculty_id === faculty.id && row.classroom_id === room.id,
      'Sunday 09:00 already has a different class; no timetable rows were changed.');
    id = row.id;
  } else {
    const overlap = await client.query(`select 1 from timetable where academic_section_id=$1 and day_of_week=0
      and start_time<'09:50'::time and end_time>'09:00'::time limit 1`, [section.id]);
    assert(!overlap.rowCount, 'A Sunday class overlaps 09:00–09:50; no timetable rows were changed.');
    id = (await client.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,
      day_of_week,start_time,end_time,academic_year,entry_type,status,published_at,period_label)
      values($1,$2,$3,$4,0,'09:00','09:50',$5,'class','published',now(),'Sunday attendance demo') returning id`,
      [subject.id,faculty.id,room.id,section.id,section.academic_year])).rows[0].id;
  }

  const result = {section_id:section.id,section:'CSE Year 2 · Section 3',academic_year:section.academic_year,
    day:'Sunday',time:'09:00–09:50',subject:subject.name,faculty_email:'aswini@gvpcew.ac.in',room:'LOCAL-SUNDAY-CSE2-SEC3',timetable_id:id};
  await client.query('commit');
  await writeFile(new URL('../../.tmp/sunday-section3-attendance-demo.json', import.meta.url), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
