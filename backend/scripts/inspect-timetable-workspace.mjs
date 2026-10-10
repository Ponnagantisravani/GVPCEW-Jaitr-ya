import {pool} from '../src/config/db.js';
try {
  for (const sql of [
    "select status,count(*) from timetable group by status",
    "select count(*) active_assignments from faculty_assignments where status='active'",
    "select key,jsonb_typeof(published->'grid') grid_type from academic_documents where kind='timetable' and published is not null",
    "select u.full_name,count(distinct t.id) published_periods,count(distinct fa.id) manual_assignments from faculty f join users u on u.id=f.user_id left join timetable t on t.faculty_id=f.id and t.status='published' left join faculty_assignments fa on fa.faculty_id=f.id and fa.status='active' group by f.id,u.full_name having count(distinct t.id)>0 order by u.full_name"
  ]) console.log(JSON.stringify((await pool.query(sql)).rows));
} catch(e) {console.log('Database inspection failed:',e.code || e.message);process.exitCode=1;}
finally {await pool.end();}
