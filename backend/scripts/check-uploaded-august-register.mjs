import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {createApp} from '../src/app.js';
let server;
try{
 const {rows}=await pool.query("select id from users where lower(email)='deepthim@gvpcew.ac.in' and active");
 assert.equal(rows.length,1);
 const live=process.argv.includes('--live');
 if(!live){server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));}
 const base=`http://127.0.0.1:${live?env.port:server.address().port}/api/faculty/attendance-uploads`;
 assert.equal((await fetch(base)).status,401);
 const token=jwt.sign({sub:rows[0].id},env.jwtSecret,{expiresIn:'2m'});
 const response=await fetch(base,{headers:{Authorization:'Bearer '+token,'X-Portal-Role':'faculty'}});
 assert.equal(response.status,200);
 const registers=(await response.json()).registers;
 const register=registers.find(row=>row.month==='2026-08'&&row.section_name==='3');
 assert.ok(register);assert.equal(register.payload.rows.length,70);
 assert.equal(new Set(register.payload.rows.map(row=>row.roll_number)).size,70);
 assert.equal(register.payload.importKind,'roll_numbers');
 const summary=registers.find(row=>row.month==='2026-08'&&row.section_name==='1');
 assert.ok(summary);assert.equal(summary.payload.rows.length,69);assert.equal(summary.payload.importKind,'daily_register');
 assert.deepEqual(summary.payload.days,Array.from({length:31},(_,i)=>i+1));
 for(const row of summary.payload.rows){assert.equal(row.marks.length,31);assert.ok(row.marks.every(mark=>['P','A','-'].includes(mark)));assert.equal(row.marks.filter(mark=>mark==='P').length,row.present);assert.equal(row.marks.filter(mark=>mark==='A').length,row.absent);}
 assert.ok(summary.payload.rows.every(row=>row.present+row.absent===27));
 assert.equal(summary.payload.rows[0].percentage,96.3);
 console.log('Verified CSE–1 August daily register: 69 rows, 31 dates, P/A marks match all totals.');
 console.log('Verified: authenticated faculty upload view returns the August 2026 III CSE–3 register with 70 unique roll numbers.');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();}
