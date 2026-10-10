import dotenv from 'dotenv';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE), connectionTimeoutMillis: 10000, query_timeout: 30000 });
await client.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-faculty-assignments'))");
  const schema = await readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('create table if not exists faculty_section_assignments');
  const end = schema.indexOf('\n\ncreate table if not exists timetable', start);
  await client.query(schema.slice(start, end));
  const relation = await client.query("select relkind from pg_class where relname='faculty_assignments' and relnamespace='public'::regnamespace");
  if (relation.rows[0]?.relkind === 'v') await client.query('drop view faculty_assignments');
  // Compatibility view for legacy routes. The table remains the single source
  // of truth; exposing all fields also supports the faculty workspace joins.
  await client.query(`create view faculty_assignments as select * from faculty_section_assignments`);
  await client.query('commit');
  console.log('Faculty assignment schema is ready.');
} catch (error) { await client.query('rollback'); throw error; }
finally { await client.end(); }
