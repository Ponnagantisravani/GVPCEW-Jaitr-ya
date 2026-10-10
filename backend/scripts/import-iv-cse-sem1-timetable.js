import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const academicYear = '2026-2027';
const slots = [
  ['08:40','09:30'], ['09:30','10:20'], ['10:20','11:10'],
  ['12:00','12:50'], ['12:50','13:40'], ['13:40','14:30']
];
const days = ['MON','TUE','WED','THU','FRI'];
const dayNumber = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5 };

const faculty = {
  BDS: 'Mrs. B. Divyasati', ASR: 'Mr. A. Srinivasa Rao', KSS: 'Mrs. K. Satyasri',
  NS: 'Dr. N. Sharmili', DS: 'Mrs. D. Sarvani', VGA: 'Mrs. V. Gowtami Annapurna',
  YS: 'Mrs. Y. Sowmya', BLVV: 'Dr. B. L. V. Vinay Kumar', PA: 'Mrs. P. Abhilasha',
  YAVLP: 'Mrs. Y. A. V. Lakshmi Prasanna', KS: 'Mrs. K. Suneetha', GSR: 'Dr. G. Sankara Rao',
  KL: 'Mrs. K. Lakshmi', KR: 'Dr. K. Rohini', DI: 'Dr. D. Indu', KVSM: 'Mrs. K. V. S. Mounica',
  VSSP: 'Mrs. V. S. Swathi Priya', RA: 'Mrs. R. Archana', RN: 'Dr. R. Neelima'
};
const courses = {
  E1: ['CSE701-E1', 'GPS & A / Industry 4.0'], E2: ['CSE702-E2', 'HCI / SPM'],
  E3: ['CSE703-E3', 'NLP / BDA'], E4: ['CSE704-E4', 'IoT / CSF'],
  DT: ['CSE705', 'Design Thinking & Product Innovation'], DL: ['CSE706', 'Deep Learning'],
  OB: ['CSE707', 'Organizational Behaviour'], PROJECT: ['CSE708', 'Project Work'],
  COUNSELLING: ['CSE709', 'Counselling']
};
// Each row is Monday–Friday; cells follow the six instructional periods in the supplied workbook.
const schedule = {
  1: [
    [['E1','BDS'],['OB','KSS'],['E2','NS'],['OB','KSS'],['PROJECT','VGA'],['DL','VGA']],
    [['OB','KSS'],['DL','VGA'],['E1','BDS'],['E3','YS'],['E4','PA'],['E2','NS']],
    [['DT','KS'],['E4','PA'],['E1','BDS'],['E3','YS'],['DT','KS'],['PROJECT','VGA']],
    [['E2','NS'],['E1','BDS'],['DT','KS'],['E3','YS'],['DL','VGA'],['E4','PA']],
    [['OB','KSS'],['E4','PA'],['E2','NS'],['DL','VGA'],['COUNSELLING','VGA'],['E3','YS']]
  ],
  2: [
    [['E1','BDS'],['DL','VGA'],['E2','NS'],['DL','VGA'],['OB','KSS'],['PROJECT','GSR']],
    [['DT','GSR'],['DT','GSR'],['E1','BDS'],['E3','YS'],['E4','PA'],['E2','NS']],
    [['OB','KSS'],['E4','PA'],['E1','BDS'],['E3','YS'],['PROJECT','GSR'],['DL','VGA']],
    [['E2','NS'],['E1','BDS'],['DT','GSR'],['E3','YS'],['OB','KSS'],['E4','PA']],
    [['DL','VGA'],['E4','PA'],['E2','NS'],['OB','KSS'],['COUNSELLING','GSR'],['E3','YS']]
  ],
  3: [
    [['E1','BDS'],['DL','KR'],['E2','NS'],['DL','KR'],['PROJECT','KR'],['PROJECT','KR']],
    [['DT','KS'],['OB','KSS'],['E1','BDS'],['E3','KVSM'],['E4','PA'],['E2','NS']],
    [['DL','KR'],['E4','PA'],['E1','BDS'],['E3','KVSM'],['OB','KSS'],['DT','KS']],
    [['E2','NS'],['E1','BDS'],['OB','KSS'],['E3','KVSM'],['COUNSELLING','KR'],['E4','PA']],
    [['DT','KS'],['E4','PA'],['E2','NS'],['DL','KR'],['OB','KSS'],['E3','KVSM']]
  ],
  4: [
    [['E1','BDS'],['DT','RA'],['E2','NS'],['DT','RA'],['PROJECT','KR'],['DL','KR']],
    [['OB','RN'],['DT','RA'],['E1','BDS'],['E3','KVSM'],['E4','PA'],['E2','NS']],
    [['OB','RN'],['E4','PA'],['E1','BDS'],['E3','KVSM'],['DL','KR'],['OB','RN']],
    [['E2','NS'],['E1','BDS'],['DL','KR'],['E3','KVSM'],['PROJECT','KR'],['E4','PA']],
    [['DL','KR'],['E4','PA'],['E2','NS'],['OB','RN'],['COUNSELLING','KR'],['E3','KVSM']]
  ]
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE), connectionTimeoutMillis: 10000, query_timeout: 30000 });
await client.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('import-iv-cse-sem1-timetable'))");
  let department = (await client.query("select id from departments where lower(name) in ('computer science engineering','computer science & engineering','cse') order by case when name='Computer Science Engineering' then 0 else 1 end limit 1")).rows[0];
  if (!department) department = (await client.query("insert into departments(name) values('Computer Science Engineering') returning id")).rows[0];

  const sectionIds = {}, roomIds = {}, subjectIds = {}, facultyIds = {};
  for (const section of [1,2,3,4]) {
    const { rows } = await client.query(`insert into academic_sections(department_id,year_number,semester_number,section_name,academic_year) values($1,4,7,$2,$3)
      on conflict(department_id,year_number,semester_number,section_name,academic_year) do update set section_name=excluded.section_name returning id`, [department.id, String(section), academicYear]);
    sectionIds[section] = rows[0].id;
    const room = (await client.query(`insert into classrooms(room_code,building_name,room_name,active) values($1,'CSE Block',$2,true)
      on conflict(room_code) do update set active=true returning id`, [String([201,202,203,214][section-1]), `IV CSE Section ${section}`])).rows[0];
    roomIds[section] = room.id;
  }
  for (const [key,[code,name]] of Object.entries(courses)) {
    subjectIds[key] = (await client.query(`insert into subjects(department_id,code,name) values($1,$2,$3)
      on conflict(code) do update set name=excluded.name,department_id=excluded.department_id returning id`, [department.id, code, name])).rows[0].id;
  }
  for (const [code, fullName] of Object.entries(faculty)) {
    let person = (await client.query('select f.id from faculty f where f.employee_code=$1', [`TT-${code}`])).rows[0];
    if (!person) {
      const email = `timetable-${code.toLowerCase()}@faculty.invalid`;
      let user = (await client.query('select id from users where email=$1', [email])).rows[0];
      if (!user) user = (await client.query("insert into users(full_name,email,password_hash,role) values($1,$2,$3,'faculty') returning id", [fullName, email, await bcrypt.hash(randomBytes(32).toString('hex'), 10)])).rows[0];
      await client.query("insert into user_roles(user_id,role) values($1,'faculty') on conflict do nothing", [user.id]);
      person = (await client.query('insert into faculty(user_id,department_id,employee_code) values($1,$2,$3) returning id', [user.id, department.id, `TT-${code}`])).rows[0];
    }
    facultyIds[code] = person.id;
  }
  let inserted = 0;
  for (const [section, week] of Object.entries(schedule)) for (let dayIndex = 0; dayIndex < week.length; dayIndex++) for (let slotIndex = 0; slotIndex < week[dayIndex].length; slotIndex++) {
    const [course, teacher] = week[dayIndex][slotIndex], [startTime,endTime] = slots[slotIndex];
    const result = await client.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status)
      select $1,$2,$3,$4,$5,$6,$7,$8,$9,'draft'
      where not exists(select 1 from timetable where subject_id=$1 and faculty_id=$2 and classroom_id=$3 and academic_section_id=$4 and day_of_week=$5 and start_time=$6::time and end_time=$7::time and academic_year=$8)
      returning id`, [subjectIds[course], facultyIds[teacher], roomIds[section], sectionIds[section], dayNumber[days[dayIndex]], startTime, endTime, academicYear, course === 'COUNSELLING' ? 'counselling' : course === 'PROJECT' ? 'other' : 'class']);
    inserted += result.rowCount;
  }
  await client.query('commit');
  console.log(JSON.stringify({ importedDraftEntries: inserted, sections: 4, subjects: Object.keys(courses).length, facultyProfiles: Object.keys(faculty).length, rooms: 4 }));
} catch (error) {
  await client.query('rollback');
  console.error(`Timetable import rolled back (${error.code || error.name}): ${error.message}`);
  process.exitCode = 1;
} finally { await client.end(); }
