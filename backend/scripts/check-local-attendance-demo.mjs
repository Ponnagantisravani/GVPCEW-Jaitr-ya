import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Local database required.');
const client=new pg.Client({connectionString:url.href,ssl:getSslConfig(url.href)});
try {await client.connect();const result=await client.query("select (select count(*) from students s join users u on u.id=s.user_id where u.active and s.academic_section_id is not null)::int assigned_active_students,(select count(*) from student_coordinator_sections cs join students s on s.user_id=cs.user_id and s.academic_section_id=cs.academic_section_id join users u on u.id=s.user_id where u.active and exists(select 1 from user_roles r where r.user_id=u.id and r.role='student_coordinator'))::int assigned_active_coordinators");console.log(JSON.stringify(result.rows[0],null,2));}finally{await client.end();}
