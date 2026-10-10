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
    update timetable
    set faculty_id = (select f.id from faculty f join users u on u.id = f.user_id where lower(u.email) = lower($1)),
        updated_at = now()
    where faculty_id = (select id from faculty where employee_code = 'TT-MD')
  `, ['deepthim@gvpcew.ac.in']);
  await client.query('commit');
  console.log(JSON.stringify({ linkedTimetableEntries: result.rowCount }));
} catch (error) {
  await client.query('rollback');
  console.error(`Linking rolled back (${error.code || error.name}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
