import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readSession, rememberAttendanceLink, destinationForRole,preferredRole,roleForPath,accountStorageKey} from '../src/session.js';
const storage = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}; };
beforeEach(()=>{globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.window={location:{pathname:'/student.html',search:''}};});
test('malformed and incomplete sessions return to sign-in',()=>{
 for(const value of ['{', 'null', '[]', '{"token":"abc"}', '{"token":"abc","user":{"roles":"admin"}}']) {localStorage.setItem('gvpcew_session',value);assert.equal(readSession(),null);}
});
test('only known portal roles are used for navigation',()=>{
 localStorage.setItem('gvpcew_session',JSON.stringify({token:'abc',user:{roles:['unknown','student']}}));
 assert.deepEqual(readSession().user.roles,['student']);
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
