import bcrypt from 'bcryptjs';
import {pool} from '../src/config/db.js';

const passwordHash=await bcrypt.hash('123456789',12);
const accounts=[
 {email:'324103210168.lasya@gvpcew.ac.in',name:'Lasya',role:'student',roll:'324103210168'},
 {email:'suneetha.k@gvpcew.ac.in',name:'Suneetha K',role:'academic_coordinator'},
 {email:'324103210170.sravani@gvpcew.ac.in',name:'Sravani',role:'student_coordinator'},
 {email:'deepthim@gvpcew.ac.in',name:'Deepthi M',role:'faculty',employee:'DEEPTHIM'},
 {email:'324103210164.nihitha@gvpcew.ac.in',name:'Nihitha',role:'admin'}
];
const client=await pool.connect();
try{
 await client.query('begin');
 const dept=(await client.query("select id from departments where lower(name)='computer science engineering' limit 1")).rows[0];
 if(!dept)throw new Error('Computer Science Engineering department is missing.');
 const section=(await client.query("select id from academic_sections where department_id=$1 and year_number=3 and section_name='4' order by academic_year desc limit 1",[dept.id])).rows[0];
 if(!section)throw new Error('CSE third-year Section 4 is missing.');
 const ids={};
 for(const account of accounts){
  let user=(await client.query('select id from users where lower(email)=lower($1)',[account.email])).rows[0];
  if(!user&&account.roll)user=(await client.query('select user_id id from students where roll_number=$1',[account.roll])).rows[0];
  if(!user)user=(await client.query('insert into users(full_name,email,password_hash,role,active) values($1,$2,$3,$4,true) returning id',[account.name,account.email,passwordHash,account.role==='admin'?'admin':account.role==='faculty'?'faculty':'student'])).rows[0];
  else await client.query('update users set full_name=$2,password_hash=$3,active=true,role=$4 where id=$1',[user.id,account.name,passwordHash,account.role==='admin'?'admin':account.role==='faculty'?'faculty':'student']);
  ids[account.role]=user.id;
  await client.query('delete from user_roles where user_id=$1',[user.id]);
  await client.query('insert into user_roles(user_id,role) values($1,$2)',[user.id,account.role]);
  if(account.role==='student'){
   await client.query(`insert into students(user_id,roll_number,section,department_id,academic_section_id,face_enrollment_status,profile_details) values($1,$2,'4',$3,$4,'completed',$5)
    on conflict(user_id) do update set roll_number=excluded.roll_number,section=excluded.section,department_id=excluded.department_id,academic_section_id=excluded.academic_section_id,face_enrollment_status='completed',profile_details=excluded.profile_details`,[user.id,account.roll,dept.id,section.id,JSON.stringify({course:'B.Tech',batch:'2023-2027',department_code:'CSE',year:'III',section:'4'})]);
  }
  if(account.role==='faculty')await client.query(`insert into faculty(user_id,employee_code,department_id) values($1,$2,$3) on conflict(user_id) do update set employee_code=excluded.employee_code,department_id=excluded.department_id`,[user.id,account.employee,dept.id]);
 }
 await client.query('delete from academic_coordinator_departments where user_id=$1',[ids.academic_coordinator]);
 await client.query('insert into academic_coordinator_departments(user_id,department_id) values($1,$2)',[ids.academic_coordinator,dept.id]);
 await client.query('delete from academic_institution_access where user_id=$1',[ids.academic_coordinator]);
 await client.query('delete from student_coordinator_sections where user_id=$1',[ids.student_coordinator]);
 await client.query('insert into student_coordinator_sections(user_id,academic_section_id) values($1,$2)',[ids.student_coordinator,section.id]);
 await client.query('commit');
 console.log(JSON.stringify({configured:accounts.map(a=>({email:a.email,role:a.role})),studentSection:section.id},null,2));
}catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();}
