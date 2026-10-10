import test from 'node:test';
import assert from 'node:assert/strict';
import {checkInput,generateTimetable,verifyTimetable} from '../src/services/timetableSolver.js';
const input={sections:[{name:'III CSE - 1',room:'215',subjects:[['CD',4],['DWDM',4],['IRS/MPMC',4],['CN',4],['AI',4],['DT&E',3],['COUNSELLING',1],['TERMPROJECT',3],['DEVOPS',3],['CN LAB',3],['DM LAB',3]].map(([name,hours])=>({name,hours,kind:['DEVOPS','CN LAB','DM LAB'].includes(name)?'lab':'theory',teachers:name==='IRS/MPMC'?['Deepthi','Hemalata']:[name+' teacher'],rooms:[name+' room']}))}]};
test('full 36-period section generates with exact counts and no lunch-crossing labs',()=>{
 const result=generateTimetable(input);assert.deepEqual(result.reasons,[]);assert.deepEqual(verifyTimetable(input,result.slots),[]);
 for(const subject of input.sections[0].subjects)assert.equal(result.slots.filter(s=>s.subject===subject.name).reduce((n,s)=>n+s.span_len,0),subject.hours);
 for(const slot of result.slots.filter(s=>s.kind==='lab'))assert.ok([1,4].includes(slot.period));
});
test('teacher capacity and excessive section hours explain infeasibility',()=>{const bad=structuredClone(input);bad.sections[0].subjects.forEach(s=>s.teachers=['Same teacher']);assert.ok(checkInput(bad).some(r=>r.includes('Same teacher')));bad.sections[0].subjects[0].hours=5;assert.ok(checkInput(bad).some(r=>r.includes('37')));});
test('tampered or incomplete drafts are rejected',()=>{const result=generateTimetable(input);assert.ok(verifyTimetable(input,result.slots.slice(1)).length);const edited=structuredClone(result.slots);edited[0].teachers=['Unknown'];assert.ok(verifyTimetable(input,edited).length);});
