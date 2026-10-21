import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RoleDashboard} from '../../src/RoleDashboards.jsx';
import {api} from '../../src/api.js';
import {CALENDAR_TEMPLATES} from '../../src/AcademicCalendarManagement.jsx';
import {syllabusTemplates} from '../../src/SyllabusEditor.jsx';
import '../../css/admin.css';
if (!import.meta.env.DEV) throw new Error('Development fixture only');
const params=new URLSearchParams(location.search), role=params.get('role')||'student', active=params.get('screen')||'Dashboard';
const person={id:'student-demo',full_name:'Example Student With A Longer Family Name',roll_number:'DEMO202600000001',department:'Computer Science & Engineering',section:'1',profile_details:{},id_details:{course:'B.Tech',department_code:'CSE',batch:'2024–2028'}};
const subject={id:'subject-demo',code:'24CS101',name:'Database Management Systems and Applications',department:person.department};
const catalog={departments:[{id:'dept-demo',name:person.department}],sections:[{id:'section-demo',department:person.department,year_number:2,semester_number:3,section_name:'1',academic_year:'2026–2027',students:1}],students:[person],faculty:[{id:'faculty-demo',full_name:'Example Faculty'}],subjects:[subject],classrooms:[{id:'room-demo',room_code:'CSE-301'}],requests:[]};
const assignedSection={id:'section-demo',department_id:'dept-demo',year_number:2,semester_number:3,section_name:'1',academic_year:'2026–2027'};
const attendanceExpiry=new Date(Date.now()+55000).toISOString(),lateExpiry=new Date(Date.now()+175000).toISOString();
const liveAttendanceSession={id:'attendance-session-demo',section_id:assignedSection.id,section_name:'1',subject_name:'Default attendance',period:'Default',started_at:new Date(Date.now()-5000).toISOString(),expires_at:attendanceExpiry,late_expires_at:lateExpiry,status:'open',final:false};
const liveAttendanceStatus={id:liveAttendanceSession.id,expires_at:attendanceExpiry,late_expires_at:lateExpiry,server_time:new Date().toISOString(),valid_for_ms:55000,final:false,status:'open',absent:1,total:3,present:1,late:1,unmarked:[{student_id:'student-pending',roll_number:'DEMO202600000003',full_name:'Example Student Pending'}],present_students:[{student_id:'student-present',roll_number:'DEMO202600000001',full_name:'Example Student Present',status:'PRESENT'},{student_id:'student-late',roll_number:'DEMO202600000002',full_name:'Example Student Late',status:'LATE'}]};
// Stub storage in this iframe only; never replace a real signed-in session.
Storage.prototype.getItem=function(key){return key==='gvpcew_session'?JSON.stringify({token:'local-layout-fixture',user:{roles:[role]}}):null;};
Storage.prototype.setItem=function(){};
const common={subjects:[subject],timetable:[],notices:[],events:[],users:[],notifications:[],values:{students:100,subjects:12,faculty:10},assignments:[],marks:[],requests:[],sessions:[],attendance:[],documents:[],reports:[]};
api.get=async url=>{
 if(url==='/students/dashboard')return {data:{attendance:95,pendingAssignments:0,notifications:[]}};
 if(url==='/students/profile')return {data:{profile:person}};
 if(url==='/students/attendance')return {data:{subjects:[{...subject,classes:40,present:38,percentage:95}]}};
 if(url==='/attendance/student/attendance')return {data:{subjects:[],records:[],today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Calcutta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}};
 if(url==='/attendance/subjects')return {data:{section:assignedSection,subjects:[{subject_id:subject.id,code:subject.code,name:subject.name,kind:'theory'}],slots:[{id:'slot-demo',period:1,subject_id:subject.id,subject_name:subject.name}],batches:[],default_duration_seconds:600,demo:false}};
 if(url==='/attendance/sessions/current')return {data:{session:null}};
 if(url==='/attendance/sessions')return {data:{sessions:[liveAttendanceSession]}};
 if(url.startsWith('/attendance/session/')&&url.endsWith('/status'))return {data:liveAttendanceStatus};
 if(url==='/local-attendance-demo/configuration')return {data:{enabled:false}};
 if(url==='/faculty/workspace')return {data:{...catalog,assignments:[],marks:[],requests:[]}};
 if(url==='/management/catalog')return {data:catalog};
 if(url==='/academic-documents/calendar')return {data:{documents:[{key:'main',payload:{...CALENDAR_TEMPLATES[0],status:'Published'},published_at:'2026-01-01'}]}};
 if(url==='/syllabi')return {data:{syllabi:[{...syllabusTemplates[0].create(),id:'syllabus-demo',status:'published'}]}};
 return {data:common};
};
for(const method of ['post','put','patch','delete','request'])api[method]=async()=>{throw new Error('Writes disabled in layout fixtures');};
if(params.get('native')==='1')window.ReactNativeWebView={postMessage:message=>{try{const value=JSON.parse(message);if(value.type==='open-attendance')window.dispatchEvent(new CustomEvent('preview:native-attendance-request',{detail:value}));}catch{}}};
function Preview(){const [page,setPage]=useState(active),[nativePreviewStatus,setNativePreviewStatus]=useState('');useEffect(()=>{const show=event=>setNativePreviewStatus(event.detail?.start_default_attendance?'Android action previewed. Attendance started in the campus app.':'Android action previewed. Returning to the Bluetooth attendance scanner.');window.addEventListener('preview:native-attendance-request',show);return()=>window.removeEventListener('preview:native-attendance-request',show);},[]);return <><RoleDashboard role={role} name={person.full_name} active={page} roles={[role]} onNavigate={setPage} onLogout={()=>{}} onRoleChange={()=>{}}/>{nativePreviewStatus&&<div role="status" style={{position:'fixed',left:12,right:12,bottom:84,zIndex:9999,padding:'12px 16px',borderRadius:10,background:'#143f36',color:'#fff',fontSize:13,boxShadow:'0 8px 24px #0003'}}>{nativePreviewStatus}</div>}</>;}
createRoot(document.getElementById('root')).render(<Preview/>);
window.addEventListener('error',e=>parent.postMessage({kind:'layout-error',message:e.message},location.origin));
const pause=()=>new Promise(r=>setTimeout(r,100));
async function verify(){
 for(let n=0;n<80;n++){await pause();if(document.querySelector('.content')&&!document.querySelector('.loading')&&!document.body.innerText.includes('Loading your teaching workspace'))break;}
 await pause(); await pause();
 if(params.get('modal')){const button=[...document.querySelectorAll('button')].find(b=>/load template/i.test(b.textContent));button?.click();await pause();}
 const failures=[];
 if(params.get('modal')&&!document.querySelector('[role=dialog],.timetable-modal-content'))failures.push('Template modal missing');
 if(!document.querySelector('.content'))failures.push('Missing content');
 const width=innerWidth;
 const overflow=[...document.querySelectorAll('.content *')].filter(el=>{
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
  if(!rect.width||!rect.height||style.visibility==='hidden'||el.closest('aside'))return false;
  for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return false;}
  return rect.right>width+2||rect.left< -2;
 }).map(el=>el.tagName+'.'+el.className).slice(0,12);
 if(overflow.length)failures.push('Overflow: '+overflow.join(', '));
 if(document.documentElement.scrollWidth>width+2)failures.push('Page width '+document.documentElement.scrollWidth+' > '+width);
 if(width<=900&&!params.get('modal')){
  const menu=document.querySelector('.mobile-menu');menu.click();await pause();
  if(!document.querySelector('aside.open'))failures.push('Menu did not open');
  if(!document.querySelector('aside').contains(document.activeElement))failures.push('Menu did not receive focus');
  if(document.body.style.position!=='fixed')failures.push('Background scroll unlocked');
  document.querySelector('.sidebar-close').click();await pause();
  if(document.querySelector('aside.open'))failures.push('Menu did not close');
  if(document.body.style.position==='fixed')failures.push('Background scroll stayed locked');
 }
 if(active==='Digital ID'&&document.querySelector('input:not([type=file])'))failures.push('Identity editor visible');
 document.documentElement.dataset.layoutResult=JSON.stringify({role,screen:active,width,failures});
 parent.postMessage({kind:'layout-result',role,screen:active,width,failures},location.origin);
}
verify();
