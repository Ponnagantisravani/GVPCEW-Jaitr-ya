import dotenv from 'dotenv';
import pg from 'pg';
import {getSslConfig} from '../src/utils/dbAdmin.js';

dotenv.config({path:new URL('../.env',import.meta.url)});
const email=process.argv[2]?.trim().toLowerCase();
if(!email)throw new Error('Provide the existing account email.');
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('This helper requires the local database.');
const roles=['student','student_coordinator','faculty','academic_coordinator','admin'];
const roll=email.match(/^(\d+)\./)?.[1]||'';
const c=new pg.Client({connectionString:url.href,ssl:getSslConfig(url.href)});
let begun=false;
try {
 await c.connect();await c.query('begin');begun=true;
 const matches=(await c.query('select u.id,u.email,u.active,s.id student_id,s.academic_section_id,s.department_id from users u left join students s on s.user_id=u.id where lower(u.email)=$1 or (u.email=$2 and s.roll_number=$3) for update of u',[email,roll+'@students.invalid',roll])).rows;
 if(matches.length!==1)throw new Error('An unambiguous existing student account is required.');
 const user=matches[0];
 if(!user?.active||!user.student_id||!user.academic_section_id||!user.department_id)throw new Error('The existing account must be active and have a student section and department.');
 if(user.email!==email)await c.query('update users set email=$2 where id=$1',[user.id,email]);
 for(const role of roles)await c.query('insert into user_roles(user_id,role) values($1,$2) on conflict do nothing',[user.id,role]);
 await c.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2) on conflict do nothing',[user.id,user.academic_section_id]);
 await c.query("insert into faculty(user_id,employee_code,department_id) values($1::uuid,'AUTO-'||($1::uuid)::text,$2::uuid) on conflict(user_id) do nothing",[user.id,user.department_id]);
 await c.query('insert into academic_coordinator_departments(user_id,department_id) values($1,$2) on conflict do nothing',[user.id,user.department_id]);
 await c.query("insert into audit_logs(action,entity_name,entity_id,diff) values('local_dashboard_access_assignment','users',$1,$2)",[user.id,JSON.stringify({roles,previous_email:user.email,email,section_id:user.academic_section_id,department_id:user.department_id,requested_by:'local operator'})]);
 const assigned=(await c.query('select role from user_roles where user_id=$1 order by role',[user.id])).rows.map(r=>r.role);
 if(!roles.every(role=>assigned.includes(role)))throw new Error('Role verification failed.');
 await c.query('commit');begun=false;
 console.log(JSON.stringify({email,roles:assigned,student_coordinator_section_assigned:true,academic_coordinator_department_assigned:true},null,2));
}catch(error){if(begun)await c.query('rollback');throw error;}finally{await c.end();}
