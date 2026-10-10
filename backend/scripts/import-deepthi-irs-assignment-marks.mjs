import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
import {effectiveFacultyAssignments} from '../src/services/teachingAssignments.js';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
const apply=process.argv.includes('--apply');
const source=JSON.parse(readFileSync(new URL('./assignment-scores-2026-source.json',import.meta.url),'utf8'));
const entries=source.sections.filter(s=>s.subject==='IRS').flatMap(section=>section.rows.map(([roll,...scores])=>({roll,sourceSection:section.section,scores,average:Number((scores.reduce((sum,v)=>sum+(v??0),0)/3).toFixed(2))})));
assert.equal(entries.length,209);
assert.equal(new Set(entries.map(e=>e.roll)).size,entries.length);
for(const entry of entries){assert.equal(entry.scores.length,3);assert.ok(entry.scores.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<=10)));}
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL),connectionTimeoutMillis:10000,query_timeout:15000});
try{
 await db.connect();await db.query('begin');
 await db.query(readFileSync(new URL('../../database/assignment-marks.sql',import.meta.url),'utf8'));
 const assignments=(await db.query(`select distinct f.id faculty_id,su.id subject_id,x.id section_id,x.section_name from ${effectiveFacultyAssignments} a join faculty f on f.id=a.faculty_id join users u on u.id=f.user_id join subjects su on su.id=a.subject_id join academic_sections x on x.id=a.academic_section_id join departments d on d.id=x.department_id where lower(u.email)='deepthim@gvpcew.ac.in' and u.active and a.status='active' and su.code='24CT11OE01' and d.name='Computer Science Engineering' and x.year_number=3 and x.semester_number=5 and x.academic_year='2026-2027'`)).rows;
 assert.equal(new Set(assignments.map(a=>a.faculty_id)).size,1,'Expected one active Deepthi faculty account.');
 assert.equal(new Set(assignments.map(a=>a.subject_id)).size,1,'Expected one IRS subject.');
 const scope=new Map(assignments.map(a=>[a.section_id,a]));
 const students=(await db.query('select id,roll_number,academic_section_id from students where roll_number=any($1::text[])',[entries.map(e=>e.roll)])).rows;
 const byRoll=new Map(students.map(s=>[s.roll_number,s]));
 assert.equal(byRoll.size,students.length,'Student roll numbers must be unique.');
 const eligible=entries.filter(e=>scope.has(byRoll.get(e.roll)?.academic_section_id));
 const missing=entries.filter(e=>!byRoll.has(e.roll)).map(e=>e.roll);
 const outsideAssignedClasses=entries.filter(e=>byRoll.has(e.roll)&&!scope.has(byRoll.get(e.roll).academic_section_id)).map(e=>e.roll);
 assert.ok(eligible.length,'No supplied IRS marks matched assigned students.');
 let changed=0;
 for(const entry of eligible){
  const student=byRoll.get(entry.roll),assignment=scope.get(student.academic_section_id);
  const result=await db.query(`insert into marks(student_id,subject_id,examination_type,score,maximum_score,created_by,assignment_scores) values($1,$2,'assignment',$3,10,$4,$5::jsonb)
   on conflict(student_id,subject_id,examination_type) do update set score=excluded.score,maximum_score=excluded.maximum_score,created_by=excluded.created_by,assignment_scores=excluded.assignment_scores,updated_at=now()
   where marks.score is distinct from excluded.score or marks.maximum_score is distinct from excluded.maximum_score or marks.created_by is distinct from excluded.created_by or marks.assignment_scores is distinct from excluded.assignment_scores`,[student.id,assignment.subject_id,entry.average,assignment.faculty_id,JSON.stringify(entry.scores)]);
  changed+=result.rowCount;
 }
 const verified=(await db.query(`select s.roll_number,m.score,m.maximum_score,m.assignment_scores from marks m join students s on s.id=m.student_id where m.created_by=$1 and m.subject_id=$2 and m.examination_type='assignment' and s.id=any($3::uuid[])`,[assignments[0].faculty_id,assignments[0].subject_id,eligible.map(e=>byRoll.get(e.roll).id)])).rows;
 assert.equal(verified.length,eligible.length);
 const expected=new Map(eligible.map(e=>[e.roll,e.average]));
 for(const mark of verified){assert.equal(Number(mark.score),expected.get(mark.roll_number));assert.equal(Number(mark.maximum_score),10);assert.deepEqual(mark.assignment_scores,eligible.find(e=>e.roll===mark.roll_number).scores);}
 const report={mode:apply?'apply':'preview',faculty:'deepthim@gvpcew.ac.in',subject:'IRS',sourceRows:entries.length,loaded:eligible.length,changed,byAssignedSection:Object.fromEntries(assignments.map(a=>[a.section_name,eligible.filter(e=>byRoll.get(e.roll).academic_section_id===a.section_id).length])),missing,outsideAssignedClasses,sectionDifferences:eligible.filter(e=>e.sourceSection!==scope.get(byRoll.get(e.roll).academic_section_id).section_name).map(e=>({roll:e.roll,sourceSection:e.sourceSection,assignedSection:scope.get(byRoll.get(e.roll).academic_section_id).section_name})),calculation:'Average of three assignments out of 10; source blank cells count as zero.'};
 await db.query(apply?'commit':'rollback');
 if(apply)writeFileSync(new URL('./deepthi-irs-assignment-import-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}catch(error){await db.query('rollback').catch(()=>{});console.error(error.message);process.exitCode=1;}finally{await db.end();}
