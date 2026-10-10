import {pool} from '../src/config/db.js';
import {resolveTimetableFaculty} from '../src/services/timetablePublication.js';
const apply=process.argv.includes('--apply');
const db=await pool.connect();
try {
 await db.query('begin');
 await db.query("select pg_advisory_xact_lock(hashtext('timetable-write'))");
 const faculty=(await db.query('select f.id,u.full_name,u.email from faculty f join users u on u.id=f.user_id')).rows;
 const documents=(await db.query("select key,published,academic_section_ids from academic_documents where kind='timetable' and published is not null and published ? 'sourceSection'")).rows;
 let repaired=0;const unresolved=new Set();
 for(const doc of documents){
  const source=doc.published.sourceSection;
  const sections=await db.query('select id from academic_sections where department_id=$1 and year_number=$2 and semester_number=$3 and section_name=$4 and academic_year=$5',[source.departmentId,source.yearNumber,source.semesterNumber,String(source.sectionName),doc.published.academicYear]);
  const sectionId=sections.rows.length===1?sections.rows[0].id:null;
  if(!sectionId)continue;
  for(const entry of doc.published.sourceSection.entries||[]){
   if(entry.isBreak)continue;
   const names=[...new Set((entry.alternatives||[]).flatMap(a=>a.legendFaculty||[]))];
   if(!names.length)continue;
   const owners=names.map(name=>resolveTimetableFaculty(faculty,{faculty:name}));
   if(owners.some(x=>!x)){names.forEach((name,i)=>{if(!owners[i])unresolved.add(name);});continue;}
   // Repair only unambiguous single-owner cells; parallel electives and labs
   // require distinct subject ownership rather than copying every teacher.
   if(owners.length!==1)continue;
   const matching=await db.query(`select t.id from timetable t join subjects s on s.id=t.subject_id
     join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id
     where t.status='published' and t.academic_section_id=$1 and t.day_of_week=$2
     and lower(u.full_name)='gvpcew faculty' and
     (lower(s.name)=lower($3) or lower(s.code)=lower($3))`,[sectionId,entry.dayOfWeek,entry.rawEntry]);
   for(const row of matching.rows){
    await db.query('update timetable set faculty_id=$2,start_time=$3::time,end_time=$4::time,updated_at=now() where id=$1',[row.id,owners[0].id,entry.startTime,entry.endTime]);repaired++;
   }
  }
 }
 console.log(JSON.stringify({mode:apply?'apply':'preview',repairedPeriods:repaired,unresolvedFaculty:[...unresolved]},null,2));
 await db.query(apply?'commit':'rollback');
}catch(e){await db.query('rollback');console.error(e.message);process.exitCode=1;}
finally{db.release();await pool.end();}
