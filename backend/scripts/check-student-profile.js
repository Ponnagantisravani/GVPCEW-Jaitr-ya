// Read-only integration check against the configured PostgreSQL database.
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
let server;
try {
 const {rows}=await pool.query("select s.id,s.user_id,s.roll_number,u.full_name from students s join users u on u.id=s.user_id where exists(select 1 from user_roles r where r.user_id=s.user_id and r.role='student') and ($1::text is null or s.roll_number=$1) order by s.roll_number limit 1",[process.argv[2]||null]);
 assert.ok(rows[0], 'No linked student account available for verification.');
 const student=rows[0];
 server=createApp().listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const token=jwt.sign({sub:student.user_id},env.jwtSecret,{expiresIn:'1m'});
 const url='http://127.0.0.1:'+server.address().port+'/api/students/profile';
 assert.equal((await fetch(url)).status,401,'Profile must require authentication');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
 const body=await response.json();
 assert.equal(response.status,200,body.message);
 assert.equal(body.profile.id,student.id);
 assert.equal(body.profile.roll_number,student.roll_number);
 assert.equal(body.profile.full_name,student.full_name);
 assert.ok(Object.hasOwn(body.profile,'year'));
 assert.ok(body.profile.id_details && Object.hasOwn(body.profile.id_details,'batch'));
 console.log('PASS: authenticated student profile returns the linked identity and ID details.');
 console.log('ID fields populated:',JSON.stringify({name:!!body.profile.full_name,rollNumber:!!body.profile.roll_number,course:!!body.profile.id_details.course,batch:!!body.profile.id_details.batch,departmentCode:!!body.profile.id_details.department_code}));
} finally {
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();
}
