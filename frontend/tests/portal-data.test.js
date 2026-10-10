import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settlePortalRequests} from '../src/portal-data.js';
test('student profile survives unrelated timetable and marks failures',async()=>{
 const profile={roll_number:'TEST123',full_name:'Test Student'};
 const result=await settlePortalRequests([Promise.reject(new Error('Timetable unavailable')),Promise.resolve({data:{profile}}),Promise.reject(new Error('Marks unavailable'))]);
 assert.equal(result.failed,true);assert.deepEqual(result.responses[1].data.profile,profile);assert.deepEqual(result.responses[0].data,{});
});
test('successful responses preserve their order',async()=>{
 const result=await settlePortalRequests([Promise.resolve({data:{profile:{}}}),Promise.resolve({data:{marks:[]}})]);
 assert.equal(result.failed,false);assert.deepEqual(result.responses.map(r=>r.data),[{profile:{}},{marks:[]}]);
});
