// Read-only checks against existing accounts. Never prints identities or tokens.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const known=['admin','academic_coordinator','faculty','student','student_coordinator'];
let checked=0;
try {
 const {rows:accounts}=await pool.query('select user_id,role from user_roles order by user_id,role');
 const allRoleAccounts=new Set(accounts.map(r=>r.user_id));
 console.log('Accounts explicitly assigned all five roles:',[...allRoleAccounts].filter(id=>accounts.filter(r=>r.user_id===id).length===5).length);
 for(const role of known){
  const selected=accounts.filter(r=>r.role===role).slice(0,2);
  if(!selected.length){console.log('No existing account for role:',role);continue;}
  for(const account of selected){
   const token=jwt.sign({sub:account.user_id},env.jwtSecret,{expiresIn:'2m'});
   const get=async(path)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api`+path,{headers:{Authorization:'Bearer '+token,'X-Portal-Role':role}});return {status:response.status,data:await response.json()};};
   for(const path of ['/dashboard?role='+role,'/subjects','/timetable','/notices']){
    const result=await get(path);assert.equal(result.status,200,role+' '+path+': '+result.data.message);
   }
   if(role!=='admin')assert.equal((await get('/users')).status,403);
   if(!['admin','academic_coordinator'].includes(role))assert.equal((await get('/management/catalog')).status,403);
   if(role==='faculty'){
    const workspace=await get('/faculty/workspace');
    if(workspace.status===200){
     const expected=await pool.query("select distinct s.id from students s join timetable t on t.academic_section_id=s.academic_section_id join faculty f on f.id=t.faculty_id where f.user_id=$1 and t.status='published'",[account.user_id]);
     assert.deepEqual(workspace.data.students.map(s=>s.id).sort(),expected.rows.map(s=>s.id).sort(),'Faculty student isolation');
     const profile=await pool.query('select id from faculty where user_id=$1',[account.user_id]);
     assert.equal(workspace.data.profile.id,profile.rows[0].id);
     for(const student of workspace.data.students)assert.ok(student.subject_ids.length>0);
    }else assert.equal(workspace.status,404,'Unassigned faculty must fail closed');
    assert.equal((await get('/timetables/faculty/student-view')).status,200);
    assert.equal((await get('/faculty/leave-requests')).status,200);
    assert.equal((await get('/attendance-sessions/catalog')).status,200);
   }
   if(['student','student_coordinator'].includes(role)){
    if(role==='student_coordinator')assert.equal((await get('/attendance-sessions/catalog')).status,200);
    const profile=await get('/students/profile');
    if(profile.status===200){
     const expected=await pool.query('select id from students where user_id=$1',[account.user_id]);
     assert.equal(profile.data.profile.id,expected.rows[0].id);
     for(const path of ['/students/assignments','/students/attendance','/students/dashboard'])assert.equal((await get(path)).status,200,role+' '+path);
    }else assert.equal(profile.status,404);
   }
   checked++;
  }
  console.log('PASS dashboard and account isolation:',role);
 }
 console.log(`PASS ${checked} account/role combinations checked without changing records.`);
}catch(e){console.error('FAIL',e.message);process.exitCode=1;}
finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
