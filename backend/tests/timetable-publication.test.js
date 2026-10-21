import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTimetableFaculty, syncTimetableAssignments} from '../src/services/timetablePublication.js';

const faculty = [{id:'one',full_name:'Dr. K. Sravani',email:'sravani@example.com'},
  {id:'two',full_name:'Mrs. P. Vani',email:'vani@example.com'}];
test('resolves registered faculty by ID, email, and normalized name', () => {
  for (const slot of [{facultyId:'one'}, {faculty:'sravani@example.com'}, {faculty:'K Sravani'}])
    assert.equal(resolveTimetableFaculty(faculty,slot)?.id,'one');
});
test('resolves title and middle-name variants when the supplied initials agree', () => {
  const directory = [{id:'aswini',full_name:'Madhavi Aswini',email:'aswini@example.com'}];
  assert.equal(resolveTimetableFaculty(directory,{faculty:'Dr. M. Aswini'})?.id,'aswini');
  assert.equal(resolveTimetableFaculty(directory,{faculty:'Mrs. Madhavi Aswini'})?.id,'aswini');
  assert.equal(resolveTimetableFaculty(directory,{faculty:'Dr. A. Aswini'}),null);
});
test('chooses the sole institutional account over a duplicate synthetic seed account', () => {
  const directory = [
    {id:'seed',full_name:'Mrs. M. Aswini',email:'timetable-ma@faculty.invalid'},
    {id:'real',full_name:'Mrs. M. Aswini',email:'aswini@gvpcew.ac.in'}
  ];
  assert.equal(resolveTimetableFaculty(directory,{faculty:'Dr. M. Aswini'})?.id,'real');
});
test('unmatched, partial, shared and ambiguous names never pick an arbitrary account', () => {
  for (const name of ['', 'Librarian','Sravani','K Sravani / P Vani'])
    assert.equal(resolveTimetableFaculty(faculty,{faculty:name}),null);
  assert.equal(resolveTimetableFaculty([...faculty,{id:'three',full_name:'K Sravani'}],{faculty:'K Sravani'}),null);
});
test('conflicting teaching owners stop publication before assignment changes', async () => {
  let calls=0;
  await assert.rejects(syncTimetableAssignments({query:async()=>{calls++;return {rows:[{}]};}},['section'],'user'), /multiple faculty/);
  assert.equal(calls,1);
});
test('publication synchronizes assignment access for the affected sections', async () => {
  const calls=[];
  await syncTimetableAssignments({query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}},['section'],'user');
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].args,[['section'],'user']);
  assert.match(calls[1].sql,/on conflict\(academic_section_id,subject_id\)/);
});
