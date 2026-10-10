import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply');
const db=await pool.connect();
try {
 await db.query('begin');
 await db.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");
 const profiles=(await db.query(`select f.id from faculty f join users u on u.id=f.user_id where lower(u.email)='deepthim@gvpcew.ac.in'`)).rows;
 if(profiles.length!==1)throw new Error('Expected exactly one Deepthi login profile.');
 const facultyId=profiles[0].id;
 const assignments=(await db.query(`select fa.*,su.name subject from faculty_section_assignments fa
 join subjects su on su.id=fa.subject_id where fa.faculty_id=$1 and fa.status='active'`,[facultyId])).rows;
 let inserted=0;const sections=[];
 for(const assignment of assignments){
  if(!/\bIRS\b/i.test(assignment.subject))continue;
  const docs=(await db.query(`select published from academic_documents where kind='timetable' and key=$1 and published is not null`,['section-'+assignment.academic_section_id])).rows;
  if(docs.length!==1)throw new Error('Expected one uploaded timetable for assigned section.');
  const entries=docs[0].published.sourceSection?.entries;
  if(!Array.isArray(entries))throw new Error('Uploaded source periods are missing.');
  let matched=0;
  for(const entry of entries){
   if(entry.isBreak||!(entry.alternatives||[]).some(a=>a.subjectLabel==='IRS'&&(a.legendFaculty||[]).some(name=>/deepthi/i.test(name))))continue;
   const rooms=(await db.query(`select id from classrooms where lower(room_code)=lower($1) or lower(room_code)=lower('Room '||$1)`,[entry.room])).rows;
   if(!rooms.length)throw new Error('Uploaded classroom was not found: '+entry.room);
   const result=await db.query(`insert into timetable(subject_id,faculty_id,classroom_id,academic_section_id,day_of_week,start_time,end_time,academic_year,entry_type,status,published_at,published_by)
     select $1,$2,$3,$4,$5,$6::time,$7::time,$8,'class','published',now(),$9
     where not exists(select 1 from timetable where subject_id=$1 and faculty_id=$2 and academic_section_id=$4 and day_of_week=$5 and start_time=$6::time and end_time=$7::time and status='published')`,
     [assignment.subject_id,facultyId,rooms[0].id,assignment.academic_section_id,entry.dayOfWeek,entry.startTime,entry.endTime,assignment.academic_year,assignment.created_by]);
   inserted+=result.rowCount;matched++;
  }
  if(!matched)throw new Error('No uploaded IRS periods matched Deepthi for an assigned section.');
  sections.push({sectionId:assignment.academic_section_id,matchedPeriods:matched});
 }
 console.log(JSON.stringify({mode:apply?'apply':'preview',insertedPeriods:inserted,sections},null,2));
 await db.query(apply?'commit':'rollback');
}catch(e){await db.query('rollback');console.error(e.message);process.exitCode=1;}
finally{db.release();await pool.end();}
