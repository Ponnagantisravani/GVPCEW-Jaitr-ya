import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import jwt from 'jsonwebtoken';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
let server;
try {
 const profiles=(await pool.query("select id from users where lower(email)='deepthim@gvpcew.ac.in' and active")).rows;
 assert.equal(profiles.length,1);
 const token=jwt.sign({sub:profiles[0].id},env.jwtSecret,{expiresIn:'2m'});
 const live=process.argv.includes('--live');
 if(!live){server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));}
 const base=`http://127.0.0.1:${live?env.port:server.address().port}/api`;
 const get=async path=>{
  const response=await fetch(base+path,{headers:{Authorization:'Bearer '+token,'X-Portal-Role':'faculty'}});
  assert.equal(response.status,200,path);
  return response.json();
 };
 const workspace=await get('/faculty/workspace');
 assert.equal(workspace.profile.email,'deepthim@gvpcew.ac.in');
 assert.ok(workspace.subjects.some(s=>s.code==='24CT11OE01'));
 assert.ok(workspace.classAssignments.some(s=>s.year_number===3&&s.section_name==='1'));
 assert.ok(workspace.classAssignments.some(s=>s.year_number===3&&s.section_name==='2'));
 assert.ok(workspace.classAssignments.some(s=>s.year_number===3&&s.section_name==='3'));
 const reportUrl=new URL('./deepthi-irs-assignment-import-report.json',import.meta.url);
 const report=JSON.parse(readFileSync(reportUrl,'utf8'));
 const irs=workspace.subjects.find(subject=>subject.code==='24CT11OE01');
 const marks=workspace.marks.filter(mark=>mark.subject_id===irs.id&&mark.examination_type==='assignment');
 assert.ok(marks.length>=report.loaded,'Imported IRS assignment marks must be visible in Deepthi workspace.');
 const source=JSON.parse(readFileSync(new URL('./assignment-scores-2026-source.json',import.meta.url),'utf8'));
 const expected=new Map(source.sections.filter(s=>s.subject==='IRS').flatMap(s=>s.rows.map(([roll,...scores])=>[roll,Number((scores.reduce((sum,v)=>sum+(v??0),0)/3).toFixed(2))])));
 let verifiedMarks=0;
 for(const student of workspace.students){if(!expected.has(student.roll_number))continue;const mark=marks.find(m=>m.student_id===student.id);assert.ok(mark,'Missing IRS assignment marks for '+student.roll_number);assert.equal(Number(mark.score),expected.get(student.roll_number));assert.equal(Number(mark.maximum_score),10);const original=source.sections.flatMap(s=>s.rows).find(row=>row[0]===student.roll_number);assert.deepEqual(mark.assignment_scores,original.slice(1));verifiedMarks++;}
 assert.equal(verifiedMarks,report.loaded);
 const schedule=await get('/timetables/faculty');
 assert.ok(schedule.timetable.length>0);
 assert.ok(schedule.timetable.every(row=>row.code==='24CT11OE01'));
 assert.ok(schedule.documents.some(doc=>doc.key==='section-'+workspace.classAssignments[0].section_id));
 const studentSchedule=await get('/timetables/faculty/student-view');
 assert.ok(studentSchedule.documents.some(doc=>doc.payload?.sourceSection?.entries?.length));
 const assigned=workspace.classAssignments.find(s=>s.section_name==='3');
 assert.ok(workspace.students.some(student=>student.academic_section_id===assigned.section_id));
 assert.ok(schedule.timetable.some(period=>period.section_id===assigned.section_id));
 const attendance=await get(`/faculty/attendance?subjectId=${assigned.subject_id}&sectionId=${assigned.section_id}&date=2026-10-04`);
 assert.ok(Array.isArray(attendance.attendance));
 console.log(JSON.stringify({verifiedLogin:workspace.profile.email,subjects:workspace.subjects.length,assignedClasses:workspace.classAssignments.length,students:workspace.students.length,publishedPeriods:schedule.timetable.length,attendanceAccess:'passed',verifiedAssignmentMarks:verifiedMarks}));
}finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();}
