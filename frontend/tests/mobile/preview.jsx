import React, {useState} from 'react';
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
// Stub storage in this iframe only; never replace a real signed-in session.
Storage.prototype.getItem=function(key){return key==='gvpcew_session'?JSON.stringify({token:'local-layout-fixture',user:{roles:[role]}}):null;};
Storage.prototype.setItem=function(){};
const common={subjects:[subject],timetable:[],notices:[],events:[],users:[],notifications:[],values:{students:100,subjects:12,faculty:10},assignments:[],marks:[],requests:[],sessions:[],attendance:[],documents:[],reports:[]};
api.get=async url=>{
 if(url==='/students/dashboard')return {data:{attendance:95,pendingAssignments:0,notifications:[]}};
 if(url==='/students/profile')return {data:{profile:person}};
 if(url==='/students/attendance')return {data:{subjects:[{...subject,classes:40,present:38,percentage:95}]}};
 if(url==='/faculty/workspace')return {data:{...catalog,assignments:[],marks:[],requests:[]}};
 if(url==='/management/catalog')return {data:catalog};
 if(url==='/academic-documents/calendar')return {data:{documents:[{key:'main',payload:{...CALENDAR_TEMPLATES[0],status:'Published'},published_at:'2026-01-01'}]}};
 if(url==='/syllabi')return {data:{syllabi:[{...syllabusTemplates[0].create(),id:'syllabus-demo',status:'published'}]}};
 return {data:common};
};
for(const method of ['post','put','patch','delete','request'])api[method]=async()=>{throw new Error('Writes disabled in layout fixtures');};
function Preview(){const [page,setPage]=useState(active);return <RoleDashboard role={role} name={person.full_name} active={page} roles={[role]} onNavigate={setPage} onLogout={()=>{}} onRoleChange={()=>{}}/>;}
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
