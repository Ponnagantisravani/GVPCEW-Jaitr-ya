import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readSession, rememberAttendanceLink, destinationForRole,preferredRole,roleForPath,accountStorageKey,assignedRoles} from '../src/session.js';
const storage = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}; };
beforeEach(()=>{globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={location:{pathname:'/student.html',search:''}};});
test('malformed and incomplete sessions return to sign-in',()=>{
 for(const value of ['{', 'null', '[]', '{"token":"abc"}', '{"token":"abc","user":{"roles":"admin"}}']) {localStorage.setItem('gvpcew_session',value);assert.equal(readSession(),null);}
});
test('only known portal roles are used for navigation',()=>{
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'abc',user:{roles:['unknown','student']}}));
 assert.deepEqual(readSession().user.roles,['student']);
});

test('native campus session replaces another account cached in the web dashboard',()=>{
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'old',user:{id:'old',roles:['admin']}}));
 window.ReactNativeWebView={injectedObjectJson:()=>JSON.stringify({campusSession:{token:'native',user:{id:'new',roles:['student','faculty']},activeRole:'faculty'}})};
 assert.equal(readSession().user.id,'new');assert.equal(readSession().activeRole,'faculty');
 assert.equal(JSON.parse(localStorage.getItem('gvpcew_session')).token,'native');
});

test('legacy single-role login responses can open a dashboard without bypassing explicit access lists',()=>{
 assert.equal(preferredRole({role:'student'}),'student');
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'abc',user:{role:'student'}}));
 assert.deepEqual(readSession().user.roles,['student']);
 assert.deepEqual(assignedRoles({role:'admin',roles:[]}),[]);
 assert.deepEqual(assignedRoles({role:'admin',roles:['student']}),['student']);
 assert.equal(preferredRole({role:'unknown'}),undefined);
 assert.equal(preferredRole({role:'admin',roles:'admin'}),undefined);
});
test('attendance QR destination survives sign-in and is consumed once',()=>{
 window.location.search='?attendanceCode=ab12345678';rememberAttendanceLink();
 assert.equal(destinationForRole('faculty'),'/faculty.html');
 assert.equal(destinationForRole('student'),'/student.html?attendanceCode=AB12345678');
 assert.equal(destinationForRole('student'),'/student.html');
});
test('invalid attendance links are ignored',()=>{
 window.location.search='?attendanceCode=https://example.com';rememberAttendanceLink();
 assert.equal(destinationForRole('student'),'/student.html');
 assert.equal(destinationForRole('unknown'),'/index.html');
});
test('dashboard selection uses assigned roles and ignores an unauthorized requested role',()=>{
 assert.equal(preferredRole({role:'faculty',roles:['faculty']},'admin'),'faculty');
 assert.equal(preferredRole({role:'admin',roles:['student']}),'student');
 assert.equal(preferredRole({roles:[]}),undefined);
 assert.equal(roleForPath('/faculty.html'),'faculty');
 assert.equal(roleForPath('/academic-coordinator/dashboard'),'academic_coordinator');
});
test('reminders are isolated between accounts sharing one browser',()=>{
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'a',user:{id:'first',roles:['student']}}));
 const first=accountStorageKey('reminders');
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'b',user:{id:'second',roles:['student']}}));
 assert.notEqual(first,accountStorageKey('reminders'));
});
