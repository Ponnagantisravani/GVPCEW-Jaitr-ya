import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(env.databaseUrl).hostname),'Sunday demo is restricted to the local database.');
const c=await pool.connect();try{await c.query('begin');await c.query("select pg_advisory_xact_lock(hashtext('local-sunday-attendance-demo'))");
const x=(await c.query("select x.*,u.id user_id from academic_sections x join students s on s.academic_section_id=x.id join users u on u.id=s.user_id where u.email=$1 and x.year_number=3 and x.semester_number=5",['324103210170.sravani@gvpcew.ac.in'])).rows[0];assert(x,'Expected coordinator class not found.');
const sample=(await c.query("select faculty_id from timetable where academic_section_id=$1 and status='published' order by day_of_week,start_time limit 1",[x.id])).rows[0];assert(sample,'Existing demo timetable faculty reference required.');
const room=(await c.query("insert into classrooms(room_code,building_name,room_name) values('LOCAL-SUNDAY-DEMO','Local demo','Sunday attendance testing') on conflict(room_code) do update set room_code=excluded.room_code returning id")).rows[0];
const output=[];for(const [period,code,start,end,kind] of [[1,'CSE506','09:00','09:50','class'],[2,'CSE510-L','09:50','10:40','lab'],[3,'CSE510-L','10:40','11:30','lab'],[4,'CSE510-L','11:30','12:20','lab']]){
 const subject=(await c.query('select id,name from subjects where code=$1',[code])).rows[0];assert(subject,'Subject missing: '+code);
 const exists=(await c.query("select id,subject_id,classroom_id from timetable where academic_section_id=$1 and day_of_week=0 and start_time=$2::time and end_time=$3::time",[x.id,start,end])).rows;
 if(exists.length){assert(exists.length===1&&exists[0].subject_id===subject.id&&exists[0].classroom_id===room.id,'Existing Sunday timetable conflicts with the demo.');output.push({period,subject:subject.name,start,end,id:exists[0].id});continue;}
 assert(!(await c.query('select 1 from timetable where academic_section_id=$1 and day_of_week=0 and start_time<$3::time and end_time>$2::time',[x.id,start,end])).rowCount,'Sunday period overlaps existing timetable.');
 const inserted=(await c.query("insert into timetable(subject_id,classroom_id,faculty_id,day_of_week,start_time,end_time,academic_year,academic_section_id,status,entry_type,period_label) values($1,$2,$3,0,$4,$5,$6,$7,'published',$8,$9) returning id",[subject.id,room.id,sample.faculty_id,start,end,x.academic_year,x.id,kind,'P'+period+' · Local Sunday demo'])).rows[0];output.push({period,subject:subject.name,start,end,id:inserted.id});}
await c.query("insert into audit_logs(actor_user_id,action,entity_name,entity_id,diff) values($1,'add_local_sunday_demo','timetable',$2,$3::jsonb)",[x.user_id,x.id,JSON.stringify(output)]);await c.query('commit');await writeFile(new URL('../../.tmp/sunday-attendance-demo.json',import.meta.url),JSON.stringify({section:x.section_name,section_id:x.id,periods:output},null,2)+'\n');console.log(JSON.stringify({section:x.section_name,periods:output},null,2));
}catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
