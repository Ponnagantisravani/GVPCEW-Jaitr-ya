import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {getSslConfig} from '../src/utils/dbAdmin.js';

dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL),connectionTimeoutMillis:10000,query_timeout:30000});
try {
 await client.connect();
 const sql=await readFile(new URL('../../database/cse3-test-timetable.sql',import.meta.url),'utf8');
 const results=await client.query(sql);
 for(const result of Array.isArray(results)?results:[results])if(result.rows?.length)console.log(JSON.stringify(result.rows));
 console.log('III CSE section 3 test timetable saved. Refresh coordinator attendance.');
} catch(error) {
 await client.query('ROLLBACK').catch(()=>{});
 console.error('Test timetable not saved:',error.message);
 process.exitCode=1;
} finally {await client.end();}
