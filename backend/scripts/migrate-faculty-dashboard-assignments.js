import dotenv from 'dotenv';
import pg from 'pg';
import { getSslConfig } from '../src/utils/dbAdmin.js';
dotenv.config({ path: new URL('../.env', import.meta.url) });
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL,process.env.DATABASE_SSL_MODE),connectionTimeoutMillis:10000,query_timeout:30000});
await client.connect();
try{await client.query('begin');await client.query('alter table assignments add column if not exists academic_section_id uuid references academic_sections(id) on delete cascade');await client.query('create index if not exists idx_assignments_section on assignments(academic_section_id,subject_id)');await client.query('commit');console.log('Faculty dashboard assignment columns are ready.');}catch(error){await client.query('rollback');throw error;}finally{await client.end();}
