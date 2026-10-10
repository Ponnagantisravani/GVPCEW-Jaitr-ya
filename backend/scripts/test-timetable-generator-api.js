import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
import {configurationTemplate,parseConfiguration} from '../../shared/timetableConfiguration.js';
const client=await pool.connect(), originalQuery=pool.query.bind(pool),originalConnect=pool.connect.bind(pool);
let server;
try{
 await client.query('BEGIN');
 const schema=`timetable_api_test_${Date.now()}`;
 await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET LOCAL search_path TO ${schema},public`);
 const migration=await readFile(new URL('../../database/timetable-generator.sql',import.meta.url),'utf8');
 await client.query(migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
 const {rows}=await client.query("SELECT u.id FROM public.users u JOIN public.user_roles r ON r.user_id=u.id WHERE u.active AND r.role='academic_coordinator' LIMIT 1");
 assert.ok(rows[0],'An active Academic Coordinator account is required for this integration test.');
 const token=jwt.sign({sub:rows[0].id},env.jwtSecret,{expiresIn:'5m'});
 pool.query=(...args)=>client.query(...args);pool.connect=async()=>({query:(...args)=>client.query(...args),release(){}});
 // The isolated outer transaction must survive the route's transaction boundaries.
 const query=client.query.bind(client);
 client.query=(sql,...args)=>/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)?Promise.resolve({rows:[]}):query(sql,...args);
 server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/timetable`;
 async function request(path,body,auth=true){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`,'X-Portal-Role':'academic_coordinator'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
 assert.equal((await request('/check',{},false)).status,401);
 const {input}=parseConfiguration(configurationTemplate());input.sections[1].classTeacher='Dr. K. Rohini';input.sections[2].classTeacher='Mrs. K. Sirisha';input.sections[3].classTeacher='Mrs. V. S. Swathi Priya';input.sections[3].room='TEST-SECTION-4';
 const checked=await request('/check',input);assert.equal(checked.status,200,JSON.stringify(checked.data));
 const generated=await request('/generate',{...checked.data.input,solver:{seed:42}});assert.equal(generated.status,200,JSON.stringify(generated.data));
 const saved=await request('/save',{input:generated.data.input,slots:generated.data.slots,name:'API integration fixture'});assert.equal(saved.status,201,JSON.stringify(saved.data));
 const id=saved.data.version.id;
 assert.equal((await request('/'+id)).data.slots.length,generated.data.slots.length);
 await client.query('DELETE FROM timetable_slots WHERE version_id=$1 AND day=0 AND period=1',[id]);
 assert.equal((await request('/'+id+'/publish',{})).status,422);
 const valid=await request('/save',{input:generated.data.input,slots:generated.data.slots,name:'Valid publication fixture'});assert.equal(valid.status,201,JSON.stringify(valid.data));
 assert.equal((await request('/'+valid.data.version.id+'/publish',{})).data.version.status,'published');
 console.log('Authentication, parsing/allocation, global generation, draft/read and publication revalidation passed.');
 client.query=query;
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));pool.query=originalQuery;pool.connect=originalConnect;
 // Bypass the route transaction shim even if an assertion failed.
 await Object.getPrototypeOf(client).query.call(client,'ROLLBACK');client.release();await pool.end();
}
