import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
const email=process.argv[2];if(!email)throw new Error('Provide the existing student account email.');
const url=new URL(process.env.DATABASE_URL);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('This assignment helper requires the local database.');
const c=new pg.Client({connectionString:url.href,ssl:getSslConfig(url.href)});let begun=false;
try {await c.connect();await c.query('begin');begun=true;
 const user=(await c.query('select u.id,u.active,s.id student_id,s.academic_section_id from users u left join students s on s.user_id=u.id where lower(u.email)=lower($1) for update of u',[email])).rows[0];
 if(!user?.active||!user.student_id||!user.academic_section_id)throw new Error('The existing account must be active and have an assigned student section.');
 await c.query("insert into user_roles(user_id,role) values($1,'student_coordinator') on conflict do nothing",[user.id]);
 await c.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2) on conflict do nothing',[user.id,user.academic_section_id]);
 const section=(await c.query('select x.section_name,x.year_number,x.semester_number,d.name department from academic_sections x join departments d on d.id=x.department_id where x.id=$1',[user.academic_section_id])).rows[0];
 await c.query("insert into audit_logs(action,entity_name,entity_id,diff) values('local_demo_coordinator_assignment','users',$1,$2)",[user.id,JSON.stringify({role:'student_coordinator',section_id:user.academic_section_id,requested_by:'local operator',source:'local demo setup helper'})]);
 await c.query('commit');begun=false;console.log(JSON.stringify({email,student_coordinator:true,section},null,2));
}catch(error){if(begun)await c.query('rollback');throw error;}finally{await c.end();}
