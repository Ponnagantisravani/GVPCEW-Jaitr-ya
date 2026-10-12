import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {syncTimetableAssignments} from '../src/services/timetablePublication.js';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(env.databaseUrl).hostname),'Local database only');
const section='100c7dd2-7a72-48b1-bcb2-c0289f97d25d';
const courses={AI:['CSE507','MA'],CD:['CSE501','GSR'],IRS:['CSE503-E1','KSR'],DM:['CSE511-L','YS'],DT:['CSE509','GAYATRI'],CN:['CSE506','DI'],LIB:['CSE514','DI'],DW:['CSE502','YS'],CT:['CSE512-T','GSR'],COUN:['CSE515','YS'],DEV:['CSE516-L','YAVLP'],CL:['CSE510-L','DI'],WT:['CSE513-T','YS'],HPC:['CSE505-H','SSH'],SM:['CSE508-H','MBS']};
const week=[['AI','CD','IRS','DM','DM','DM','HPC'],['AI','DT','CN','IRS','LIB','DW','SM'],['DW','CD','AI','CT','COUN','DW','HPC'],['IRS','DEV','DEV','DEV','DT','CN','SM'],['CN','AI','CD','CL','CL','CL','SM'],['CD','DT','CN','DW','IRS','WT','HPC']];
const times=[['08:40','09:30'],['09:30','10:20'],['10:20','11:10'],['12:00','12:50'],['12:50','13:40'],['13:40','14:30'],['14:30','15:20']];
const c=await pool.connect();
try{
 await c.query('begin');await c.query("select pg_advisory_xact_lock(hashtext('local-iii-cse3-faculty-setup'))");
 const x=(await c.query('select * from academic_sections where id=$1',[section])).rows[0];assert(x);
 const actor=(await c.query("select id from users where email='324103210170.sravani@gvpcew.ac.in'")).rows[0];assert(actor);
 const backup={timetable:(await c.query('select * from timetable where academic_section_id=$1',[section])).rows,assignments:(await c.query('select * from faculty_section_assignments where academic_section_id=$1',[section])).rows,documents:(await c.query("select * from academic_documents where kind='timetable' and $1::uuid=any(academic_section_ids)",[section])).rows};
 await fs.mkdir(new URL('../../.tmp/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL(`../../.tmp/iii-cse3-before-faculty-setup-${Date.now()}.json`,import.meta.url),JSON.stringify(backup,null,2));
 const faculty={},created=[];
 for(const [key,email,name] of [['DI','indu','Dr. D. Indu'],['YS','sowmya','Mrs. Y. Sowmya'],['MA','aswini','Mrs. M. Aswini'],['GSR','shankar','Dr. G. Sankara Rao'],['YAVLP','lakshmi','Mrs. Y. A. V. Lakshmi Prasanna'],['GAYATRI','gayatri','Gayatri']]){
  let u=(await c.query('select id from users where lower(email)=$1',[email+'@gvpcew.ac.in'])).rows[0];
  if(!u){u=(await c.query("insert into users(full_name,email,password_hash,role,active) values($1,$2,$3,'faculty',true) returning id",[name,email+'@gvpcew.ac.in',await bcrypt.hash('123456789',12)])).rows[0];created.push(email+'@gvpcew.ac.in');}
  await c.query("insert into user_roles(user_id,role) values($1,'faculty') on conflict do nothing",[u.id]);
  faculty[key]=(await c.query('insert into faculty(user_id,department_id,employee_code) values($1,$2,$3) on conflict(user_id) do update set department_id=excluded.department_id returning id',[u.id,x.department_id,'LOCAL-III-CSE3-'+key])).rows[0].id;
 }
 for(const key of ['KSR','SSH','MBS']){faculty[key]=(await c.query('select f.id from faculty f join users u on u.id=f.user_id where u.email=$1',['timetable-'+key.toLowerCase()+'@faculty.invalid'])).rows[0]?.id;assert(faculty[key],key);}
 const subjects={};for(const [key,[code]] of Object.entries(courses)){subjects[key]=(await c.query('select id,name from subjects where code=$1',[code])).rows[0];assert(subjects[key],code);}
 const rooms={};for(const room of ['216','CSLAB1/CSLAB2','CSLAB3/CSLAB4','PROJECTS LAB']){rooms[room]=(await c.query("insert into classrooms(room_code,room_name,building_name,active) values($1,$1,'CSE Block',true) on conflict(room_code) do update set active=true returning id",[room])).rows[0].id;}
 await c.query('delete from timetable where academic_section_id=$1 and academic_year=$2 and day_of_week between 1 and 6',[section,x.academic_year]);
 const entries=[];
 for(let day=0;day<6;day++){
  const clock=day===3?[['08:40','09:30'],['09:30','10:20'],['10:20','11:10'],['11:10','12:00'],...times.slice(4)]:times;
  for(let p=0;p<7;p++){
   const key=week[day][p],[code,teacher]=courses[key],[start,end]=clock[p],room=key==='DM'?'CSLAB3/CSLAB4':key==='CL'?'CSLAB1/CSLAB2':key==='DEV'?'PROJECTS LAB':'216';
   await c.query("insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'published')",[subjects[key].id,faculty[teacher],rooms[room],section,day+1,start,end,x.academic_year,['DM','CL','DEV'].includes(key)?'lab':key==='LIB'?'library':key==='COUN'?'counselling':'class']);
   entries.push({dayOfWeek:day+1,startTime:start,endTime:end,rawEntry:key==='IRS'?'IRS / MPMC (KSR / MHL)':key==='DM'?'DM LAB (YS, BHAVANA)':key==='CL'?'CN LAB (Dr. DI, BHOOMIKA)':subjects[key].name,room,isBreak:false,entryType:['DM','CL','DEV'].includes(key)?'lab':'class',alternatives:[{subjectLabel:subjects[key].name,legendFaculty:[teacher==='GAYATRI'?'Gayatri':teacher]}]});
  }
  entries.push({dayOfWeek:day+1,startTime:day===3?'12:00':'11:10',endTime:day===3?'12:50':'12:00',rawEntry:'LUNCH',isBreak:true,entryType:'break',alternatives:[]});
 }
 await c.query('update timetable set faculty_id=$2 where academic_section_id=$1 and day_of_week=0 and subject_id=any($3::uuid[])',[section,faculty.DI,[subjects.CN.id,subjects.CL.id]]);
 await syncTimetableAssignments(c,[section],actor.id);
 const key='section-'+section;
 const payload={title:'III CSE-3 Timetable',sourceSection:{sectionName:'3',yearNumber:3,semesterNumber:5,academicYear:x.academic_year,classTeacher:'Mrs. Y. Sowmya',entries},notes:'Local testing timetable. Main classroom 216 retained from existing setup. Design Thinking: Gayatri, as confirmed. IRS/MPMC and honors staff retain source profiles.'};
 const doc=(await c.query("select * from academic_documents where kind='timetable' and $1::uuid=any(academic_section_ids) limit 1",[section])).rows[0];assert(doc,'Existing timetable document required');
 await c.query("update academic_documents set draft=$2::jsonb,published=$2::jsonb,updated_at=now() where kind='timetable' and key=$1",[doc.key,JSON.stringify(payload)]);
 await c.query("insert into audit_logs(actor_user_id,action,entity_name,entity_id,diff) values($1,'setup_local_iii_cse3_faculty','academic_sections',$2,$3::jsonb)",[actor.id,section,JSON.stringify({created,weekdayRows:42,designThinking:'gayatri@gvpcew.ac.in',preservedSunday:true})]);
 await c.query('commit');console.log(JSON.stringify({created,weekdayRows:42,section,designThinking:'gayatri@gvpcew.ac.in'}));
}catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
