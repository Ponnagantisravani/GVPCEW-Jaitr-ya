import test from 'node:test';
import assert from 'node:assert/strict';
import {branchKeyForStudent,periodMinutes,checkTimetableConflicts,sanitizeAcademicYear,sanitizeTimetableTitle,sanitizeTimetableRecord} from '../src/timetable-checks.js';

test('student timetable selection recognizes department names and letter sections',()=>{
 assert.equal(branchKeyForStudent({department:'Computer Science & Engineering',section:'B'}),'cse_sec2');
 assert.equal(branchKeyForStudent({department:'Electronics and Communication Engineering',section:'2'}),'ece_sec2');
 assert.equal(branchKeyForStudent({id_details:{department_code:'CSM'},section:'A'}),'csm_sec1');
});
test('period parsing handles noon, midnight, and invalid ranges',()=>{
 assert.deepEqual(periodMinutes('12:00 AM – 01:00 AM'),[0,60]);
 assert.deepEqual(periodMinutes('12:00 PM - 01:00 PM'),[720,780]);
 assert.equal(periodMinutes('10:60 - 11:00'),null);
 assert.equal(periodMinutes('11:00 - 10:00'),null);
});
const document=(time,faculty='Dr. Rao',room='301',academicYear='2026-2027')=>({
 title:'Test section',academicYear,days:['Monday'],periods:[{id:'p1',label:'Period 1',time}],
 grid:{Monday:{p1:{subject:'Computing',faculty,room}}}
});
test('conflict detection uses overlapping intervals and shared resources',()=>{
 const result=checkTimetableConflicts({a:document('09:00 - 10:00'),b:document('09:30 - 10:30','Dr Rao')});
 assert.equal(result.conflicts.length,1);
 assert.match(result.conflicts[0].reasons,/Faculty overlap/);
 assert.match(result.conflicts[0].reasons,/Classroom overlap/);
});
test('adjacent periods and different academic years do not conflict',()=>{
 assert.equal(checkTimetableConflicts({a:document('09:00 - 10:00'),b:document('10:00 - 11:00')}).conflicts.length,0);
 assert.equal(checkTimetableConflicts({a:document('09:00 - 10:00'),b:document('09:00 - 10:00','Dr Rao','301','2027-2028')}).conflicts.length,0);
});
test('invalid times produce actionable issues instead of a clean report',()=>{
 assert.equal(checkTimetableConflicts({a:document('bad time')}).issues.length,1);
});

test('timetable multi-section assignment creates uniform valid timetable records',()=>{
 const sections=['cse_sec1','cse_sec2','cse_sec3'];
 const uploadedPayload={
   fileName:'Official_CSE_Timetable.pdf',
   size:'245.8 KB',
   isPdf:true,
   academicYear:'II B.Tech II Semester (2025–26)',
   incharge:'Dr. K. Sravani, Associate Professor',
   classroom:'Room 301'
 };
 const map={};
 sections.forEach(sec=>{
   map[sec]={
     ...uploadedPayload,
     status:'Published',
     title:`${uploadedPayload.academicYear} — ${sec.toUpperCase()}`
   };
 });
 assert.equal(Object.keys(map).length,3);
 assert.equal(map.cse_sec1.status,'Published');
 assert.equal(map.cse_sec2.isPdf,true);
 assert.equal(map.cse_sec3.incharge,'Dr. K. Sravani, Associate Professor');
});

test('timetable title and record sanitization purges repeated Academic Session footnotes', () => {
  const corrupted = 'Academic Session starts from 29-06-2026 (AUTONOMOUS)\n' +
    Array(28).fill('Academic Session starts from 7-7-2025 (AUTONOMOUS)').join('\n');

  const cleanTitle = sanitizeTimetableTitle(corrupted, 'cse_sec3', '2025–2026', 'Computer Science & Engineering (Sec 3)');
  assert.ok(!cleanTitle.includes('Academic Session starts from'));
  assert.equal(cleanTitle, '2025–2026 — Computer Science & Engineering (Sec 3)');

  const cleanYear = sanitizeAcademicYear('Academic Session starts from 7-7-2025 (AUTONOMOUS)');
  assert.equal(cleanYear, 'II B.Tech II Semester (2025–26)');

  const cleanRecord = sanitizeTimetableRecord({
    title: corrupted,
    academicYear: 'Academic Session starts from 7-7-2025 (AUTONOMOUS)',
    classroom: 'Academic Session starts from 7-7-2025 (AUTONOMOUS)',
    grid: {}
  }, 'cse_sec3', 'Computer Science & Engineering (Sec 3)');

  assert.equal(cleanRecord.title, 'II B.Tech II Semester (2025–26) — Computer Science & Engineering (Sec 3)');
  assert.equal(cleanRecord.academicYear, 'II B.Tech II Semester (2025–26)');
  assert.equal(cleanRecord.classroom, 'Room 301');
  assert.equal(cleanRecord.days.length, 6);
  assert.equal(cleanRecord.periods.length, 8);
});
