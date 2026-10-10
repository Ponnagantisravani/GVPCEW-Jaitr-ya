
import { pool } from '../src/config/db.js';

const email = '324103210170.sravani@gvpcew.ac.in';
const roles = ['admin', 'faculty', 'academic_coordinator', 'student', 'student_coordinator'];

async function run() {
  await pool.query(`create table if not exists user_roles (
    user_id uuid not null references users(id) on delete cascade,
    role text not null check (role in ('admin','faculty','academic_coordinator','student','student_coordinator')),
    assigned_at timestamptz not null default now(),
    assigned_by uuid references users(id) on delete set null,
    primary key (user_id, role)
  )`);


  const user = await pool.query(`select id from users where lower(email)=$1 and active`, [email]);
  if (!user.rowCount) throw new Error(`No user exists for ${email}. Register the account first, then run this script again.`);
  for (const role of roles) await pool.query(`insert into user_roles(user_id,role) values($1,$2) on conflict do nothing`, [user.rows[0].id, role]);
  await pool.query(`insert into faculty(user_id,employee_code,department_id)
    select $1::uuid,'AUTO-' || ($1::uuid)::text,(select department_id from students where user_id=$1::uuid)
    where not exists(select 1 from faculty where user_id=$1::uuid)
    on conflict(user_id) do nothing`, [user.rows[0].id]);
  await pool.query(`insert into academic_coordinator_departments(user_id,department_id)
    select user_id,department_id from students where user_id=$1 and department_id is not null
    on conflict do nothing`, [user.rows[0].id]);
  console.log(`Assigned ${roles.join(', ')} to ${email}`);
}
run().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>pool.end());


