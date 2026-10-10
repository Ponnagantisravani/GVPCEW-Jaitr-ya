import {pool} from '../src/config/db.js';
import {readFile} from 'node:fs/promises';
const client=await pool.connect();
try{await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");
 await client.query(await readFile(new URL('../../database/academic-access.sql',import.meta.url),'utf8'));
 await client.query('commit');console.log('Academic responsibility and session-revocation schema applied. No institution-wide grants added.');
}catch(e){await client.query('rollback');throw e;}finally{client.release();await pool.end();}
