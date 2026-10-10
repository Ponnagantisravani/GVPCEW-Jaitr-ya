import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceEntries,timetablePeriods,dayCells} from '../src/weekly-timetable.js';
const row=(id,start,end,day=1)=>({id,start_time:start,end_time:end,day_of_week:day});
test('merged labs span the original consecutive periods',()=>{
 const rows=[row('lab','12:00','14:30')];
 const reference=[row('a','12:00','12:50'),row('b','12:50','13:40'),row('c','13:40','14:30')];
 const periods=timetablePeriods(rows,reference);
 assert.equal(periods.length,3);
 assert.equal(dayCells(rows,1,periods)[0].span,3);
});
test('simultaneous assigned sections are retained and empty days stay free',()=>{
 const rows=[row('section-1','10:20','11:10'),row('section-2','10:20','11:10')];
 const periods=timetablePeriods(rows);
 assert.equal(dayCells(rows,1,periods)[0].entries.length,2);
 assert.equal(dayCells(rows,2,periods)[0].entries.length,0);
});
test('uploaded schedules preserve their breaks, faculty legends and actual time ranges',()=>{
 const document={payload:{sourceSection:{entries:[{dayOfWeek:1,startTime:'11:10',endTime:'12:00',isBreak:true,rawEntry:'LUNCH',alternatives:[]},{dayOfWeek:1,startTime:'12:00',endTime:'14:30',rawEntry:'CN LAB',room:'CSLAB1',alternatives:[{subjectLabel:'CNLAB',legendFaculty:['Dr. D. Indu']}]}]}}};
 const rows=sourceEntries(document,{section_id:'one'});
 assert.equal(rows[0].entry_type,'break');
 assert.equal(rows[1].faculty,'Dr. D. Indu');
 assert.equal(rows[1].start_time,'12:00');
 assert.equal(rows[1].end_time,'14:30');
 assert.equal(rows[1].section_id,'one');
});
