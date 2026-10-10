// Read-only smoke test against the configured database. No student details or tokens are printed.
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
import jwt from 'jsonwebtoken';
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
try {
 const {rows}=await pool.query("select user_id from user_roles where role in ('student','faculty','student_coordinator') limit 1");
 if(!rows[0])throw new Error('No approved student or faculty account available for the read-only check.');
 const token=jwt.sign({sub:rows[0].user_id},env.jwtSecret,{expiresIn:'1m'});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/notifications/mobile-feed`,{headers:{Authorization:'Bearer '+token}});
 const data=await response.json();
 if(!response.ok)throw new Error(data.message);
 if(!Array.isArray(data.notifications)||!Array.isArray(data.reminders))throw new Error('Invalid mobile feed.');
 if(data.reminders.some(r=>!Number.isFinite(Date.parse(r.scheduled_for))||!r.source))throw new Error('Invalid reminder schedule.');
 console.log('PASS authenticated mobile feed, database query and reminder timestamps. No records changed.');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await new Promise(resolve=>server.close(resolve));await pool.end();}
