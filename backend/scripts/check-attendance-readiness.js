import {pool} from '../src/config/db.js';
import {env} from '../src/config/env.js';
import {verifierReady} from '../src/services/attendanceVerifier.js';
const results=[];
function check(name,ready,detail=''){results.push({name,ready,detail});}
check('Identity and liveness verifier configuration',verifierReady(),'Set ATTENDANCE_VERIFIER_URL and ATTENDANCE_VERIFIER_KEY for a real verification service.');
check('Online enrollment service',Boolean(env.faceApiUrl&&env.faceServiceKey),'The development face detector cannot verify liveness.');
try {
 const {rows}=await pool.query(`select to_regclass('attendance_sessions') is not null sessions,
  to_regclass('attendance_face_challenges') is not null challenges,
  exists(select 1 from information_schema.columns where table_name='notifications' and column_name='scheduled_for') reminders`);
 for(const [name,ready] of Object.entries(rows[0]))check('Database '+name,ready);
}catch(e){check('Database connection',false,e.code||e.name);}
finally{await pool.end();}
for(const r of results)console.log(`${r.ready?'PASS':'MISSING'} ${r.name}${!r.ready&&r.detail?': '+r.detail:''}`);
console.log('Device acceptance still requires two physical Android phones. Configuration checks do not prove identity/liveness accuracy or alarm delivery.');
if(results.some(r=>!r.ready))process.exitCode=1;
