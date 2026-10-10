import dotenv from 'dotenv';
import pg from 'pg';
import { getSslConfig } from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL,process.env.DATABASE_SSL_MODE),connectionTimeoutMillis:10000,query_timeout:30000});
await client.connect();
try{await client.query('begin');await client.query(`create table if not exists section_subjects (id uuid primary key default gen_random_uuid(),academic_section_id uuid not null references academic_sections(id) on delete cascade,subject_id uuid not null references subjects(id) on delete restrict,subject_type text not null default 'theory' check (subject_type in ('theory','lab','elective','project','other')),credits numeric(4,2),semester_number integer not null check (semester_number between 1 and 8),created_by uuid references users(id) on delete set null,created_at timestamptz not null default now(),unique(academic_section_id,subject_id))`);await client.query('create index if not exists idx_section_subjects_section on section_subjects(academic_section_id)');await client.query('commit');console.log('Section subject schema is ready.');}catch(error){await client.query('rollback');throw error;}finally{await client.end();}
