import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(env.databaseUrl).hostname),'Face import is restricted to the local database.');
const data=JSON.parse(await readFile(new URL('../../.tmp/student-324103210170-template.json',import.meta.url),'utf8'));
assert(data.roll_number==='324103210170'&&data.model==='opencv-sface-demo-v1'&&data.embedding.length===128&&data.embedding.every(Number.isFinite)&&data.usable_photos>=3);
const c=await pool.connect();try{await c.query('begin');const student=(await c.query('select id,user_id from students where roll_number=$1 for update',[data.roll_number])).rows[0];assert(student,'Student not found.');
await c.query('insert into local_attendance_demo_faces(student_id,embedding,model) values($1,$2,$3) on conflict(student_id) do update set embedding=excluded.embedding,model=excluded.model,version=gen_random_uuid(),created_at=clock_timestamp()',[student.id,data.embedding,data.model]);
await c.query("insert into audit_logs(actor_user_id,action,entity_name,entity_id,diff) values($1,'assign_user_provided_local_face_dataset','local_attendance_demo_faces',$2,$3::jsonb)",[student.user_id,student.id,JSON.stringify({roll_number:data.roll_number,source:'datasets/324103210170',usable_photos:data.usable_photos,model:data.model,numeric_template_only:true})]);
const saved=(await c.query('select model,array_length(embedding,1) dimensions from local_attendance_demo_faces where student_id=$1',[student.id])).rows[0];assert(saved.dimensions===128&&saved.model===data.model);await c.query('commit');console.log('Assigned 25-photo numeric SFace template to roll 324103210170 for local webcam attendance.');
}catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
