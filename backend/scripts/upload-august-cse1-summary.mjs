import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply');
const rows=(await readFile(new URL('./cse1-august-2026-attendance.csv',import.meta.url),'utf8')).trim().split(/\r?\n/).slice(1).map(line=>{
 const [serial,roll_number,full_name,present,absent]=line.split(',');
 return {serial:Number(serial),roll_number,full_name,present:Number(present),absent:Number(absent),percentage:Number((100*Number(present)/(Number(present)+Number(absent))).toFixed(2))};
});
assert.equal(rows.length,69);assert.equal(new Set(rows.map(row=>row.roll_number)).size,69);
assert.ok(rows.every((row,index)=>row.serial===index+1&&row.present>=0&&row.absent>=0&&row.present+row.absent===27));
const payload={period:'August 2026',source:'CSE–1 spreadsheet screenshots, rows 1–69',importKind:'monthly_summary',subject:null,recordedSessions:27,rows};
await writeFile(new URL('./cse1-august-2026-summary.json',import.meta.url),JSON.stringify(payload,null,2)+'\n');
const db=await pool.connect();
try{
 const sections=(await db.query(`select x.id from academic_sections x join departments d on d.id=x.department_id where d.name='Computer Science Engineering' and x.year_number=3 and x.section_name='1' and x.academic_year='2026-2027'`)).rows;
 assert.equal(sections.length,1);
 const students=(await db.query('select roll_number,academic_section_id from students where roll_number=any($1::text[])',[rows.map(row=>row.roll_number)])).rows;
 const matching=students.filter(student=>student.academic_section_id===sections[0].id);
 console.log(JSON.stringify({mode:apply?'apply':'preview',month:'2026-08',section:'III CSE–1',summaryRows:69,matchedStudents:matching.length,missingOrDifferentClass:rows.filter(row=>!matching.some(student=>student.roll_number===row.roll_number)).map(row=>row.roll_number),subject:'Awaiting confirmation',dailyRecordsImported:0}));
 if(apply){
  await db.query('begin');
  await db.query(`insert into uploaded_attendance_registers(academic_section_id,month,title,payload,reader_user_ids)
   values($1,'2026-08','III CSE–1 · August 2026 Attendance Summary',$2::jsonb,array(select id from users where lower(email)='deepthim@gvpcew.ac.in'))
   on conflict(academic_section_id,month) do update set title=excluded.title,payload=excluded.payload,reader_user_ids=excluded.reader_user_ids,updated_at=now()`,[sections[0].id,JSON.stringify(payload)]);
  await db.query('commit');
 }
}catch(error){if(apply)await db.query('rollback');throw error;}finally{db.release();await pool.end();}
