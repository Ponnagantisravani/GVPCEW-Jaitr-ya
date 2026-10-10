import dotenv from 'dotenv';
import pg from 'pg';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE),
  connectionTimeoutMillis: 10000,
  query_timeout: 30000
});

await client.connect();
try {
  await client.query('begin');
  const result = await client.query(`
    update timetable t
    set status='published', published_at=now(), published_by=$1, updated_at=now()
    from academic_sections s join departments d on d.id=s.department_id
    where t.academic_section_id=s.id
      and lower(d.name) in ('computer science engineering','computer science & engineering','cse')
      and s.academic_year='2026-2027'
      and ((s.year_number=3 and s.semester_number=5) or (s.year_number=4 and s.semester_number=7))
      and t.status='draft'
  `, [(await client.query("select id from users where email='324103210170.sravani@gvpcew.ac.in' limit 1")).rows[0]?.id || null]);
  await client.query('commit');
  console.log(JSON.stringify({ publishedEntries: result.rowCount }));
} catch (error) {
  await client.query('rollback');
  console.error(`Publishing rolled back (${error.code || error.name}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
