import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationTemplate,parseConfiguration,validateBatch,assignFaculty,LABS,HOURS} from '../../shared/timetableConfiguration.js';
import {generateTimetable,verifyTimetable,checkInput} from '../src/services/timetableSolver.js';

// Missing production values are explicit test-only fixtures, never application defaults.
function fixture(){const {input,reasons}=parseConfiguration(configurationTemplate());assert.deepEqual(reasons,[]);input.sections[1].classTeacher='Dr. K. Rohini';input.sections[2].classTeacher='Mrs. K. Sirisha';input.sections[3].classTeacher='Mrs. V. S. Swathi Priya';input.sections[3].room='TEST-SECTION-4';input.unavailable={'Dr. D. Indu':['0:2','2:5','4:1']};const assigned=assignFaculty(input);assert.deepEqual(assigned.reasons,[]);assert.deepEqual(validateBatch(assigned.input),[]);return assigned.input;}
test('global III CSE solver satisfies all hard constraints across four sections',()=>{
 const input=fixture();const result=generateTimetable(input,{seed:42,timeoutMs:30000});assert.deepEqual(result.reasons,[]);assert.deepEqual(verifyTimetable(input,result.slots),[]);
 assert.equal(new Set(result.slots.map(s=>s.section)).size,4);
 const occupied=new Set(),teacherLoad=new Map(),subjectDaily=new Map();
 for(const s of result.slots){
  assert.ok(s.day>=0&&s.day<6);assert.ok(s.period>=1&&s.period+s.span_len<=7);
  if(s.kind==='lab'){assert.equal(s.span_len,3);assert.ok([1,4].includes(s.period));assert.deepEqual(s.rooms,LABS[s.subject]);}else assert.equal(s.span_len,1);
  if(['COUNSELLING','TERMPROJECT'].includes(s.subject))assert.equal(s.period,6);
  if(s.kind==='theory'){const key=`${s.section}/${s.subject}/${s.day}`;subjectDaily.set(key,(subjectDaily.get(key)||0)+1);assert.ok(subjectDaily.get(key)<=2);}
  for(let p=s.period;p<s.period+s.span_len;p++){
   for(const resource of [`section:${s.section}`,...s.teachers.map(t=>`teacher:${t}`),...s.rooms.map(r=>`room:${r}`)]){const key=`${resource}/${s.day}/${p}`;assert.ok(!occupied.has(key),`Clash: ${key}`);occupied.add(key);}
   for(const teacher of s.teachers){assert.ok(!input.unavailable[teacher]?.includes(`${s.day}:${p}`));const key=`${teacher}/${s.day}`;teacherLoad.set(key,(teacherLoad.get(key)||0)+1);assert.ok(teacherLoad.get(key)<=5);}
  }
 }
 for(const section of input.sections){for(const [subject,hours] of Object.entries(HOURS))assert.equal(result.slots.filter(s=>s.section===section.name&&s.subject===subject).reduce((n,s)=>n+s.span_len,0),hours);assert.equal(result.slots.filter(s=>s.section===section.name).reduce((n,s)=>n+s.span_len,0),36);}
 assert.deepEqual(input.honours.days,['HPC','SM','HPC','SM','HPC','SM']);assert.equal(input.honours.combined,true);
});
test('unknown rooms and class teachers stay required; hours cannot silently change',()=>{const parsed=parseConfiguration(configurationTemplate());const errors=validateBatch(parsed.input,{allowAuto:true});assert.ok(errors.some(e=>e.includes('Section 4 has no home classroom')));assert.ok(errors.some(e=>e.includes('Section 2 has no class teacher')));const input=fixture();input.sections[1].subjects[0].hours=3;assert.ok(validateBatch(input).some(e=>e.includes('requires 4 hours')));});
test('blocked lab windows and honours availability explain infeasibility',()=>{const input=fixture();input.roomUnavailable={CSLAB1:Array.from({length:6},(_,d)=>[`${d}:1`,`${d}:4`]).flat()};assert.ok(checkInput(input).some(e=>e.includes('valid three-period windows')));input.unavailable['Dr. SSH']=['0:7'];assert.ok(checkInput(input).some(e=>e.includes('honours')));});
test('parser reports bad lines and auto allocation preserves Section 1 multi-teacher assignments',()=>{assert.ok(parseConfiguration('bad line').reasons.length);const input=fixture();assert.deepEqual(input.sections[0].subjects.find(s=>s.name==='CN LAB').teachers,['Dr. D. Indu','Ms. Bhoomika']);for(const section of input.sections)assert.ok(section.subjects.find(s=>s.name==='IRS/MPMC').teachers.includes('Mrs. M. Hemalata'));});
