import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
const apply=process.argv.includes('--apply');
const source=(await readFile(new URL('./student-roster.csv',import.meta.url),'utf8')).trim().split(/\r?\n/).slice(1).map(line=>{const [roll_number,full_name]=line.split(',');return {roll_number,full_name};});
source.push({roll_number:'325103210L20',full_name:'PERAKAVALI PRANATHI'},
 {roll_number:'325103210L21',full_name:'VF KM BALA BHARGAVI'},
 {roll_number:'325103210L22',full_name:'PEDDEDI SAI ALA'});
const rows=source.map((row,index)=>({...row,serial:index+1}));
assert.equal(rows.length,70);assert.equal(new Set(rows.map(row=>row.roll_number)).size,70);
assert.ok(rows.every(row=>/^\d{9}(\d{3}|L\d{2})$/.test(row.roll_number)));
const payload={period:'01–31 August 2026',source:'Two uploaded III CSE–3 August attendance sheet photographs',importKind:'roll_numbers',rows};
await writeFile(new URL('./cse3-august-2026-register.json',import.meta.url),JSON.stringify(payload,null,2)+'\n');
const db=await pool.connect();
try {
 const sections=(await db.query(`select x.id from academic_sections x join departments d on d.id=x.department_id where d.name='Computer Science Engineering' and x.year_number=3 and x.section_name='3' and x.academic_year='2026-2027'`)).rows;
 assert.equal(sections.length,1);
 const existing=(await db.query('select roll_number from students where roll_number=any($1::text[])',[rows.map(row=>row.roll_number)])).rows;
 console.log(JSON.stringify({mode:apply?'apply':'preview',month:'2026-08',sheetRows:70,existingStudents:existing.length,additionalSheetRolls:rows.filter(row=>!existing.some(student=>student.roll_number===row.roll_number)).map(row=>row.roll_number)}));
 if(apply){
  await db.query('begin');
  await db.query(`create table if not exists uploaded_attendance_registers(id uuid primary key default gen_random_uuid(),academic_section_id uuid not null references academic_sections(id),month text not null,title text not null,payload jsonb not null,reader_user_ids uuid[] not null default '{}',updated_at timestamptz not null default now(),unique(academic_section_id,month))`);
  await db.query(`insert into uploaded_attendance_registers(academic_section_id,month,title,payload,reader_user_ids) values($1,'2026-08','III CSE–3 · August 2026 Roll-number Register',$2::jsonb,array(select id from users where lower(email)='deepthim@gvpcew.ac.in')) on conflict(academic_section_id,month) do update set title=excluded.title,payload=excluded.payload,reader_user_ids=excluded.reader_user_ids,updated_at=now()`,[sections[0].id,JSON.stringify(payload)]);
  await db.query('commit');
 }
}catch(error){if(apply)await db.query('rollback');throw error;}finally{db.release();await pool.end();}
