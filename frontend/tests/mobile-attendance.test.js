import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {attendanceLabel,similarityLabel,sessionDeadline,remainingSeconds,pollAttendanceRead} from '../src/mobile-attendance.js';

test('attendance labels preserve absence and late review and format server similarity',()=>{
 assert.equal(attendanceLabel({status:'PRESENT'}),'Present');assert.equal(attendanceLabel({status:'LATE'}),'Present (Late)');assert.equal(attendanceLabel({status:'ABSENT'}),'Absent');assert.equal(attendanceLabel({status:null}),'Unmarked');assert.equal(similarityLabel(.91234),'0.912');assert.equal(similarityLabel(null),'—');
});
test('countdown anchors the server budget and deducts network delay independently of browser time',()=>{
 const deadline=sessionDeadline({valid_for_ms:60000,expires_at:'2000-01-01T00:00:00Z'},1000,500);assert.equal(remainingSeconds(deadline,1000),60);assert.equal(remainingSeconds(deadline,59500),1);assert.equal(remainingSeconds(deadline,60500),0);
 assert.equal(remainingSeconds(sessionDeadline({valid_for_ms:0},1000),1000),0);
});
test('polling waits for completion, measures delay, and cancels timers and stale requests on session change',async()=>{
 let clock=0;const reads=[],pending=[],timers=[],cleared=[],data=[];const stop=pollAttendanceRead({read:signal=>{reads.push(signal);return new Promise(resolve=>pending.push(resolve));},onData:(result,timing)=>data.push({result,timing}),onError:()=>assert.fail('unexpected error'),interval:2000,now:()=>clock,setTimer:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimer:id=>cleared.push(id)});
 assert.equal(reads.length,1);assert.equal(timers.length,0);clock=400;pending.shift()({data:{id:'A'}});await Promise.resolve();assert.equal(timers.length,1);assert.equal(timers[0].ms,2000);assert.deepEqual(data[0],{result:{id:'A'},timing:{receivedAt:400,requestDurationMs:400}});
 clock=2400;timers[0].fn();assert.equal(reads.length,2);stop();assert(reads[1].aborted);assert.deepEqual(cleared,[1]);pending.shift()({data:{id:'stale-session'}});await Promise.resolve();assert.equal(data.length,1);assert.equal(timers.length,1);
});
test('polling surfaces failures and still retries without overlapping reads',async()=>{
 const issues=[],timers=[];const stop=pollAttendanceRead({read:async()=>{throw new Error('connection lost');},onData:()=>assert.fail('unexpected data'),onError:error=>issues.push(error.message),interval:4000,setTimer:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimer:()=>{}});
 await Promise.resolve();assert.deepEqual(issues,['connection lost']);assert.equal(timers.length,1);assert.equal(timers[0].ms,4000);stop();
});
test('dashboard views render counts, absences, own history and read-only late review fields',async(t)=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 try{
  const {CoordinatorAttendanceView,MobileAttendanceHistoryView,MobileAttendanceReportView}=await server.ssrLoadModule('/src/MobileAttendance.jsx');
  await t.test('coordinator sees a countdown, marked total and unmarked students',()=>{
   const html=renderToStaticMarkup(React.createElement(CoordinatorAttendanceView,{session:{status:'open',present:60,late:1,total:70,unmarked:[{student_id:'s',roll_number:'103',full_name:'Student Three'}]},seconds:17}));assert.match(html,/17s/);assert(html.includes('61/70'));assert.match(html,/Unmarked students/);assert.match(html,/Student Three/);assert.doesNotMatch(html,/<button|<input/);
  });
  await t.test('closed class shows absences and identifies whether late counts can change',()=>{
   let html=renderToStaticMarkup(React.createElement(CoordinatorAttendanceView,{session:{status:'closed',total:70,present:65,late:2,unmarked:[],final:false}}));assert.match(html,/Closed/);assert(html.includes('67/70'));assert.match(html,/Absent students/);assert.match(html,/counts may still change/);
   html=renderToStaticMarkup(React.createElement(CoordinatorAttendanceView,{session:{status:'closed',final:true}}));assert.match(html,/Attendance is final/);
  });
  await t.test('student history contains ABSENT and Present (Late) without other-student fields',()=>{
   const html=renderToStaticMarkup(React.createElement(MobileAttendanceHistoryView,{attendance:[{session_id:'a',subject_name:'DBMS',status:'ABSENT'},{session_id:'b',subject_name:'Networks',status:'LATE',method:'fallback'}]}));assert.match(html,/DBMS/);assert.match(html,/Absent/);assert(html.includes('Present (Late)'));assert.doesNotMatch(html,/Roll number|Similarity|<button|<input/);
  });
  await t.test('teacher report shows similarity, method and late review with no editing controls',()=>{
   const html=renderToStaticMarkup(React.createElement(MobileAttendanceReportView,{report:{session:{period:'p',section_name:'A',final:true},students:[{student_id:'s',roll_number:'103',full_name:'Student Three',status:'LATE',method:'fallback',similarity:.91234,is_late:true,review_required:true},{student_id:'absent',roll_number:'104',full_name:'Student Four',status:'ABSENT'}]}}));assert.match(html,/Final report/);assert(html.includes('Present (Late)'));assert.match(html,/fallback/);assert.match(html,/0.912/);assert.match(html,/Review required/);assert.match(html,/Absent/);assert.doesNotMatch(html,/<button|<input|<select/);
  });
 }finally{await server.close();}
});
