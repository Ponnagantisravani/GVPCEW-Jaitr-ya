import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL,process.env.DATABASE_SSL_MODE||'')});
try{
 await db.connect();await db.query('begin');
 const dept=(await db.query("select id,name from departments where lower(name) like '%computer%' order by name limit 1")).rows[0];if(!dept)throw Error('Create the target department first.');
 const hod=(await db.query('select user_id from hod_departments where department_id=$1 limit 1',[dept.id])).rows[0];if(!hod)throw Error('Assign an HOD role and department scope first.');
 const section=(await db.query('select id from academic_sections where department_id=$1 and year_number=1 and semester_number=1 order by section_name limit 1',[dept.id])).rows[0];if(!section)throw Error('Create a Year 1, Semester 1 section first.');
 let structure=(await db.query("select id from syllabus_structures where department_id=$1 and program='B.Tech CSE' and regulation='Sample Regulation' order by created_at limit 1",[dept.id])).rows[0];
 if(!structure)structure=(await db.query("insert into syllabus_structures(department_id,program,regulation,uploaded_by,status,confirmed_at) values($1,'B.Tech CSE','Sample Regulation',$2,'confirmed',now()) returning id",[dept.id,hod.user_id])).rows[0];
 const subjects=[];
 for(const [code,name,type,credits,periods] of [['SAMPLE101','Programming Fundamentals','theory',4,4],['SAMPLE102','Programming Lab','lab',2,3],['SAMPLE103','Mathematics I','theory',4,4],['SAMPLE104','Engineering Physics','theory',3,3]]){
  let subject=(await db.query('select id from semester_subjects where structure_id=$1 and year=1 and semester=1 and subject_code=$2',[structure.id,code])).rows[0];
  if(!subject)subject=(await db.query('insert into semester_subjects(structure_id,year,semester,subject_code,subject_name,type,credits,periods_per_week) values($1,1,1,$2,$3,$4,$5,$6) returning id',[structure.id,code,name,type,credits,periods])).rows[0];
  const catalog=(await db.query('insert into subjects(code,name,department_id,year_number,semester_number) values($1,$2,$3,1,1) on conflict(code) do update set name=excluded.name returning id',[code,name,dept.id])).rows[0];
  await db.query('update semester_subjects set subject_id=$2 where id=$1',[subject.id,catalog.id]);subjects.push(subject.id);
 }
 await db.query('commit');console.log(JSON.stringify({department:dept.name,structureId:structure.id,subjectIds:subjects,sectionId:section.id},null,2));
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
