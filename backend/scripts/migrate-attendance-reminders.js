import {pool} from '../src/config/db.js';
import {readFile} from 'node:fs/promises';
const client=await pool.connect();
try {
 await client.query('begin');
 await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");
 for(const file of ['bluetooth-attendance.sql','reminders.sql'])await client.query(await readFile(new URL('../../database/'+file,import.meta.url),'utf8'));
 await client.query('commit');
 console.log('Attendance challenge and reminder schema updated. Existing records preserved.');
}catch(e){await client.query('rollback');console.error('Migration failed:',e.code||e.name);process.exitCode=1;}
finally{client.release();await pool.end();}
