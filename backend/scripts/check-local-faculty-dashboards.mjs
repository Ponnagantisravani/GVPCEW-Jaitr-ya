import assert from 'node:assert/strict';
const base='http://127.0.0.1:4000/api';
for(const email of ['indu','sowmya','aswini','shankar','lakshmi','gayatri']){
 const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email+'@gvpcew.ac.in',password:'123456789'})});assert(response.ok,email+' login');const login=await response.json();
 const headers={Authorization:'Bearer '+(login.token||login.accessToken),'X-Active-Role':'faculty'};
 const get=async path=>{const r=await fetch(base+path,{headers});assert(r.ok,email+' '+path+' '+r.status);return r.json();};
 const w=await get('/faculty/workspace');assert(w.subjects?.length,email+' subjects');assert(w.students?.length,email+' students');assert(w.classAssignments?.length,email+' classes');
 await get('/faculty/leave-requests');await get('/timetables/faculty');await get('/timetables/faculty/student-view');await get('/attendance/faculty/subjects');
 console.log(JSON.stringify({email:email+'@gvpcew.ac.in',subjects:w.subjects.length,students:w.students.length,classes:w.classAssignments.length,verified:'login, workspace, leave requests, faculty timetable, student timetable, subject attendance'}));
}
