import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
const payload=JSON.parse(await readFile(new URL('./cse1-august-2026-daily.json',import.meta.url),'utf8'));
assert.equal(payload.rows.length,69);
assert.equal(new Set(payload.rows.map(r=>r.roll_number)).size,69);
for(const r of payload.rows){assert.equal(r.marks.length,31);assert.ok(r.marks.every(m=>['P','A','-'].includes(m)));assert.equal(r.marks.filter(m=>m==='P').length,r.present);assert.equal(r.marks.filter(m=>m==='A').length,r.absent);}
try{
const sections=(await pool.query("select x.id from academic_sections x join departments d on d.id=x.department_id where d.name='Computer Science Engineering' and x.year_number=3 and x.section_name='1' and x.academic_year='2026-2027'")).rows;
assert.equal(sections.length,1);
if(process.argv.includes('--apply')){
const result=await pool.query(`insert into uploaded_attendance_registers(academic_section_id,month,title,payload,reader_user_ids) values($1,'2026-08','III CSE–1 · August 2026 Monthly Attendance',$2::jsonb,array(select id from users where lower(email)='deepthim@gvpcew.ac.in')) on conflict(academic_section_id,month) do update set title=excluded.title,payload=excluded.payload,reader_user_ids=excluded.reader_user_ids,updated_at=now() returning payload`,[sections[0].id,JSON.stringify(payload)]);
assert.deepEqual(result.rows[0].payload.rows,payload.rows);
}
console.log(JSON.stringify({applied:process.argv.includes('--apply'),students:69,dates:31,verifiedMarks:payload.rows.reduce((n,r)=>n+r.present+r.absent,0)}));
}finally{await pool.end();}
