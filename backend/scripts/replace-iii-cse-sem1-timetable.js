import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const academicYear = '2026-2027';
const periods = [['08:40','09:30'],['09:30','10:20'],['10:20','11:10'],['12:00','12:50'],['12:50','13:40'],['13:40','14:30'],['14:30','15:20']];
const dayNumbers = [1,2,3,4,5,6];
const teachers = {
 KS:'Mrs. K. Suneetha', YS:'Mrs. Y. Sowmya', MD:'Mrs. M. Deepthi', MHL:'Mrs. M. Hemalata', DI:'Dr. D. Indu', VSSP:'Mrs. V. S. Swathi Priya', VLR:'Dr. V. Lakshmana Rao', HARSHINI:'Ms. Harshini', SSH:'Dr. S. S. H', MBS:'Dr. M. B. S', MA:'Mrs. M. Aswini', RA:'Mrs. R. Archana', KL:'Mrs. K. Lakshmi', PMR:'Dr. P. Muralidhara Rao', BHOOMIKA:'Ms. Bhoomika', GSR:'Dr. G. Sankara Rao', KSR:'Mrs. K. Sirisha', DS:'Mrs. D. Sarvani', KR:'Dr. K. Rohini', VGA:'Mrs. V. Gowtami Annapurna', PSLS:'Mrs. P. S. L. Sravani', NS:'Dr. N. Sharmili'
};
const courses = {
 CD:['CSE501','Compiler Design','class'], DWDM:['CSE502','DWDM','class'], IRS:['CSE503-E1','IRS / MPMC','class'], DEVOPS:['CSE504','DevOps','class'], HPC:['CSE505-H','High Performance Computing (Honors)','class'], CN:['CSE506','Computer Networks','class'], AI:['CSE507','Artificial Intelligence','class'], SM:['CSE508-H','Social Media (Honors)','class'], DTE:['CSE509','Design Thinking & Engineering','class'], CNLAB:['CSE510-L','Computer Networks Lab','lab'], DMLAB:['CSE511-L','Data Mining Lab','lab'], CDT:['CSE512-T','Compiler Design Tutorial','class'], DWDMT:['CSE513-T','DWDM Tutorial','class'], LIB:['CSE514','Library','library'], COUNSELLING:['CSE515','Counselling','counselling']
};
// Monday–Saturday; seven values are the instructional periods, excluding the lunch interval.
const schedule = {
  1:[
   [['CD','KS'],['DWDM','YS'],['IRS','MD'],['DEVOPS','VLR'],['DEVOPS','VLR'],['DEVOPS','VLR'],['HPC','SSH']],
   [['CN','DI'],['DWDM','YS'],['AI','MA'],['IRS','MD'],['CD','KS'],['CDT','KS'],['SM','MBS']],
   [['AI','MA'],['DTE','NS'],['CN','DI'],['CNLAB','DI'],['CNLAB','DI'],['CNLAB','DI'],['HPC','SSH']],
   [['IRS','MD'],['CD','KS'],['DTE','NS'],['CN','DI'],['LIB','DI'],['DWDMT','YS'],['SM','MBS']],
   [['DMLAB','YS'],['DMLAB','YS'],['DMLAB','YS'],['DWDM','YS'],['AI','MA'],['DTE','NS'],['SM','MBS']],
   [['CD','KS'],['DWDM','YS'],['AI','MA'],['CN','DI'],['IRS','MD'],['COUNSELLING','DI'],['HPC','SSH']]
  ],
  2:[
   [['CN','PMR'],['CD','KS'],['IRS','MD'],['CN','PMR'],['CD','KS'],['AI','KL'],['HPC','SSH']],
   [['DWDM','RA'],['CD','KS'],['CN','PMR'],['IRS','MD'],['AI','KL'],['LIB','PMR'],['SM','MBS']],
   [['CNLAB','PMR'],['CNLAB','PMR'],['CNLAB','PMR'],['DWDM','RA'],['AI','KL'],['DTE','MA'],['HPC','SSH']],
   [['IRS','MD'],['DWDMT','RA'],['AI','KL'],['DTE','MA'],['CDT','KS'],['COUNSELLING','RA'],['SM','MBS']],
   [['CN','PMR'],['DWDM','RA'],['CD','KS'],['DMLAB','RA'],['DMLAB','RA'],['DMLAB','RA'],['SM','MBS']],
   [['DEVOPS','PSLS'],['DEVOPS','PSLS'],['DEVOPS','PSLS'],['DWDMT','RA'],['IRS','MD'],['DTE','MA'],['HPC','SSH']]
  ],
  3:[
   [['AI','MA'],['CD','GSR'],['IRS','KSR'],['DMLAB','YS'],['DMLAB','YS'],['DMLAB','YS'],['HPC','SSH']],
   [['AI','MA'],['DTE','KR'],['CN','DI'],['IRS','KSR'],['LIB','DI'],['DWDM','YS'],['SM','MBS']],
   [['DWDM','YS'],['CD','GSR'],['AI','MA'],['CDT','GSR'],['COUNSELLING','YS'],['DWDM','YS'],['HPC','SSH']],
   [['IRS','KSR'],['DEVOPS','VLR'],['DEVOPS','VLR'],['DEVOPS','VLR'],['DTE','KR'],['CN','DI'],['SM','MBS']],
   [['CN','DI'],['AI','MA'],['CD','GSR'],['CNLAB','DI'],['CNLAB','DI'],['CNLAB','DI'],['SM','MBS']],
   [['CD','GSR'],['DTE','KR'],['CN','DI'],['DWDM','YS'],['IRS','KSR'],['DWDMT','YS'],['HPC','SSH']]
  ],
  4:[
   [['DTE','DS'],['AI','KL'],['IRS','KSR'],['CNLAB','GSR'],['CNLAB','GSR'],['CNLAB','GSR'],['HPC','SSH']],
   [['AI','KL'],['CD','NS'],['DTE','DS'],['IRS','KSR'],['LIB','GSR'],['CN','GSR'],['SM','MBS']],
   [['DMLAB','VGA'],['DMLAB','VGA'],['DMLAB','VGA'],['DWDM','VGA'],['CD','NS'],['COUNSELLING','KL'],['HPC','SSH']],
   [['IRS','KSR'],['CN','GSR'],['DWDM','VGA'],['DEVOPS','PSLS'],['DEVOPS','PSLS'],['DEVOPS','PSLS'],['SM','MBS']],
   [['CD','NS'],['CN','GSR'],['DWDM','VGA'],['CDT','NS'],['CN','GSR'],['DWDMT','VGA'],['SM','MBS']],
   [['DTE','DS'],['DWDM','VGA'],['AI','KL'],['AI','KL'],['IRS','KSR'],['CD','NS'],['HPC','SSH']]
  ]
};
const classroomFor = (section, course) => course==='CNLAB'?'CSLAB1/CSLAB2':course==='DMLAB'?'CSLAB3/CSLAB4':course==='DEVOPS'?'PROJECTS LAB':String([215,216,221,115][section-1]);

const client = new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL,process.env.DATABASE_SSL_MODE),connectionTimeoutMillis:10000,query_timeout:30000});
await client.connect();
try {
 await client.query('begin'); await client.query("select pg_advisory_xact_lock(hashtext('replace-iii-cse-sem1-timetable'))");
 let department=(await client.query("select id from departments where lower(name) in ('computer science engineering','computer science & engineering','cse') order by case when name='Computer Science Engineering' then 0 else 1 end limit 1")).rows[0]; if(!department)department=(await client.query("insert into departments(name) values('Computer Science Engineering') returning id")).rows[0];
 const sectionIds={},facultyIds={},subjectIds={},roomIds={};
 for(const section of [1,2,3,4]) sectionIds[section]=(await client.query(`insert into academic_sections(department_id,year_number,semester_number,section_name,academic_year) values($1,3,5,$2,$3) on conflict(department_id,year_number,semester_number,section_name,academic_year) do update set section_name=excluded.section_name returning id`,[department.id,String(section),academicYear])).rows[0].id;
 for(const [key,[code,name]] of Object.entries(courses))subjectIds[key]=(await client.query(`insert into subjects(department_id,code,name) values($1,$2,$3) on conflict(code) do update set department_id=excluded.department_id,name=excluded.name returning id`,[department.id,code,name])).rows[0].id;
 for(const [code,name] of Object.entries(teachers)){let profile=(await client.query('select id from faculty where employee_code=$1',[`TT-${code}`])).rows[0];if(!profile){const email=`timetable-${code.toLowerCase()}@faculty.invalid`;let user=(await client.query('select id from users where email=$1',[email])).rows[0];if(!user)user=(await client.query("insert into users(full_name,email,password_hash,role) values($1,$2,$3,'faculty') returning id",[name,email,await bcrypt.hash(randomBytes(32).toString('hex'),10)])).rows[0];await client.query("insert into user_roles(user_id,role) values($1,'faculty') on conflict do nothing",[user.id]);profile=(await client.query('insert into faculty(user_id,department_id,employee_code) values($1,$2,$3) returning id',[user.id,department.id,`TT-${code}`])).rows[0];}facultyIds[code]=profile.id;}
 for(const room of ['215','216','221','115','CSLAB1/CSLAB2','CSLAB3/CSLAB4','PROJECTS LAB'])roomIds[room]=(await client.query(`insert into classrooms(room_code,building_name,room_name,active) values($1,'CSE Block',$2,true) on conflict(room_code) do update set active=true returning id`,[room,room])).rows[0].id;
 const deleted=await client.query(`delete from timetable where academic_section_id=any($1::uuid[]) and academic_year=$2`,[Object.values(sectionIds),academicYear]); let inserted=0;
 for(const [section,week] of Object.entries(schedule))for(let day=0;day<week.length;day++)for(let period=0;period<week[day].length;period++){const [course,teacher]=week[day][period],[start,end]=periods[period];await client.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')`,[subjectIds[course],facultyIds[teacher],roomIds[classroomFor(Number(section),course)],sectionIds[section],dayNumbers[day],start,end,academicYear,courses[course][2]]);inserted++;}
 await client.query('commit');console.log(JSON.stringify({replacedDraftEntries:deleted.rowCount,importedDraftEntries:inserted,sections:4}));
}catch(error){await client.query('rollback');console.error(`Replacement rolled back (${error.code||error.name}): ${error.message}`);process.exitCode=1;}finally{await client.end();}
