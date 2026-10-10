import dotenv from 'dotenv';
import pg from 'pg';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in backend/.env');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE || '')
});

await client.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");
  await client.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now()
  )`);
  const { rowCount } = await client.query(`insert into schema_migrations(name)
    values('20260912_dashboard_tables_v2') on conflict do nothing returning name`);
  if (rowCount) {
    await client.query(`create table if not exists attendance_sessions (
      id uuid primary key default gen_random_uuid(), coordinator_user_id uuid not null references users(id),
      subject_id uuid not null references subjects(id), section text not null, session_code text not null unique,
      starts_at timestamptz not null default now(), expires_at timestamptz, stopped_at timestamptz,
      created_at timestamptz not null default now()
    )`);
    await client.query('alter table attendance_sessions add column if not exists academic_section_id uuid references academic_sections(id)');
    await client.query('alter table attendance_sessions add column if not exists classroom_id uuid references classrooms(id)');
    await client.query('alter table attendance_sessions add column if not exists faculty_id uuid references faculty(id)');
    await client.query("alter table attendance_sessions add column if not exists verification_mode text not null default 'code'");
    await client.query(`create table if not exists notices (
      id uuid primary key default gen_random_uuid(), title text not null, description text not null,
      category text not null default 'general', published_at timestamptz not null default now(),
      expires_at timestamptz, attachment_url text, author_id uuid references users(id)
    )`);
    await client.query(`create table if not exists events (
      id uuid primary key default gen_random_uuid(), title text not null, description text,
      category text not null, starts_at timestamptz not null, ends_at timestamptz,
      location text, capacity integer check (capacity > 0), created_at timestamptz not null default now()
    )`);
  }
  await client.query('commit');
  console.log(rowCount ? 'Dashboard migration applied.' : 'Dashboard migration is already applied.');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally { await client.end(); }
