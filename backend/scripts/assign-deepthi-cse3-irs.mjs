import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply');
const db=await pool.connect();
try{
 await db.query('begin');
 await db.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");
 const profiles=(await db.query(`select f.id from faculty f join users u on u.id=f.user_id where lower(u.email)='deepthim@gvpcew.ac.in' and u.active`)).rows;
 assert.equal(profiles.length,1,'Deepthi login must resolve to one active faculty profile.');
 const facultyId=profiles[0].id;
 const sections=(await db.query(`select x.* from academic_sections x join departments d on d.id=x.department_id where d.name='Computer Science Engineering' and x.year_number=3 and x.semester_number=5 and x.section_name='3' and x.academic_year='2026-2027'`)).rows;
 assert.equal(sections.length,1,'Third-year CSE section 3 must resolve to one class.');
 const section=sections[0];
 const subjects=(await db.query("select id,name from subjects where code='24CT11OE01' and department_id=$1",[section.department_id])).rows;
 assert.equal(subjects.length,1,'IRS course must exist in the class department.');
 const subject=subjects[0];
 const documents=(await db.query("select published from academic_documents where kind='timetable' and key=$1 and published is not null",['section-'+section.id])).rows;
 assert.equal(documents.length,1,'Published section timetable must exist.');
 const entries=(documents[0].published.sourceSection?.entries||[]).filter(entry=>!entry.isBreak&&(entry.alternatives||[]).some(a=>a.subjectLabel?.toUpperCase()==='IRS'));
 assert.ok(entries.length,'IRS periods must exist in the uploaded timetable.');
 const owner=(await db.query('select created_by from faculty_section_assignments where faculty_id=$1 and status=\'active\' order by created_at limit 1',[facultyId])).rows[0]?.created_by||null;
 const previous=(await db.query('select faculty_id,status from faculty_section_assignments where academic_section_id=$1 and subject_id=$2',[section.id,subject.id])).rows;
 await db.query(`insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number,created_by) values($1,$2,'elective',$3,$4) on conflict(academic_section_id,subject_id) do nothing`,[section.id,subject.id,section.semester_number,owner]);
 await db.query(`insert into faculty_section_assignments(faculty_id,department_id,year_number,semester_number,academic_section_id,subject_id,academic_year,status,created_by)
 values($1,$2,$3,$4,$5,$6,$7,'active',$8) on conflict(academic_section_id,subject_id) do update set faculty_id=excluded.faculty_id,status='active',updated_at=now()`,[facultyId,section.department_id,section.year_number,section.semester_number,section.id,subject.id,section.academic_year,owner]);
 await db.query('update timetable set faculty_id=$1,updated_at=now() where academic_section_id=$2 and subject_id=$3 and faculty_id<>$1',[facultyId,section.id,subject.id]);
 let inserted=0;
 for(const entry of entries){
  const rooms=(await db.query("select id from classrooms where lower(room_code)=lower($1) or lower(room_code)=lower('Room '||$1)",[entry.room])).rows;
  assert.ok(rooms.length,'Uploaded classroom must exist: '+entry.room);
  const result=await db.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status,published_at,published_by)
   select $1,$2,$3,$4,$5,$6::time,$7::time,$8,'class','published',now(),$9
   where not exists(select 1 from timetable where subject_id=$1 and faculty_id=$2 and academic_section_id=$4 and day_of_week=$5 and start_time=$6::time and end_time=$7::time and status='published')`,[subject.id,facultyId,rooms[0].id,section.id,entry.dayOfWeek,entry.startTime,entry.endTime,section.academic_year,owner]);
  inserted+=result.rowCount;
 }
 const students=(await db.query('select count(*)::int total from students where academic_section_id=$1',[section.id])).rows[0].total;
 console.log(JSON.stringify({mode:apply?'apply':'preview',faculty:'deepthim@gvpcew.ac.in',class:'III CSE–3',subject:subject.name,previousAssignments:previous,publishedPeriods:entries.length,insertedPeriods:inserted,students},null,2));
 await db.query(apply?'commit':'rollback');
}catch(error){await db.query('rollback');console.error(error.message);process.exitCode=1;}finally{db.release();await pool.end();}
