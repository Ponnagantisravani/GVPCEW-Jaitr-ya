import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL)});
try{await client.connect();await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");
 for(const name of ['schema.sql','syllabus.sql','production.sql','bluetooth-attendance.sql','reminders.sql','academic-access.sql','assignment-marks.sql','mobile-attendance.sql'])await client.query(await readFile(new URL('../../database/'+name,import.meta.url),'utf8'));
 await client.query('commit');console.log('Production schema updated without deleting records or loading demo data.');
}catch(e){await client.query('rollback');throw e;}finally{await client.end();}
