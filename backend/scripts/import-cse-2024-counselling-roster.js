import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const roster = readFileSync(new URL('./cse-2024-counselling-roster.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).slice(1).map(line => {
    const [rollNumber, fullName, section] = line.split(',');
    return { rollNumber, fullName, section };
  });

assert.equal(roster.length, 235, 'The counselling roster must contain all 235 CSE students.');
assert.equal(new Set(roster.map(row => row.rollNumber)).size, roster.length, 'Duplicate roll number in counselling roster.');
assert.deepEqual(Object.fromEntries(['1', '2', '3', '4'].map(section => [section, roster.filter(row => row.section === section).length])), { 1: 70, 2: 70, 3: 70, 4: 25 });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: getSslConfig(process.env.DATABASE_URL, process.env.DATABASE_SSL_MODE),
  connectionTimeoutMillis: 10000,
  query_timeout: 30000
});

await client.connect();
try {
  await client.query('begin');
  await client.query("select pg_advisory_xact_lock(hashtext('import-cse-2024-counselling-roster'))");
  let department = (await client.query("select id from departments where lower(name) in ('computer science engineering','computer science & engineering','cse') order by case when name='Computer Science Engineering' then 0 else 1 end limit 1")).rows[0];
  if (!department) department = (await client.query("insert into departments(name) values('Computer Science Engineering') returning id")).rows[0];

  const sections = {};
  for (const sectionName of ['1', '2', '3', '4']) {
    const { rows } = await client.query(`insert into academic_sections(department_id,year_number,semester_number,section_name,academic_year)
      values($1,2,3,$2,'2025-2026')
      on conflict(department_id,year_number,semester_number,section_name,academic_year)
      do update set section_name=excluded.section_name returning id`, [department.id, sectionName]);
    sections[sectionName] = rows[0].id;
  }

  let created = 0;
  for (const row of roster) {
    let student = (await client.query('select user_id from students where roll_number=$1 for update', [row.rollNumber])).rows[0];
    if (!student) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const account = (await client.query("insert into users(full_name,email,password_hash,role) values($1,$2,$3,'student') returning id", [row.fullName, `${row.rollNumber}@students.invalid`, passwordHash])).rows[0];
      student = { user_id: account.id };
      await client.query(`insert into students(user_id,roll_number,department_id,section,academic_section_id,face_enrollment_status)
        values($1,$2,$3,$4,$5,'pending')`, [student.user_id, row.rollNumber, department.id, row.section, sections[row.section]]);
      created++;
    } else {
      await client.query('update users set full_name=$2 where id=$1', [student.user_id, row.fullName]);
      await client.query('update students set department_id=$2,section=$3,academic_section_id=$4 where user_id=$1', [student.user_id, department.id, row.section, sections[row.section]]);
    }
    await client.query("insert into user_roles(user_id,role) values($1,'student') on conflict do nothing", [student.user_id]);
  }

  const { rows } = await client.query(`select s.section,count(*)::int total from students s
    where s.department_id=$1 and s.roll_number=any($2::text[])
    group by s.section order by s.section`, [department.id, roster.map(row => row.rollNumber)]);
  assert.deepEqual(Object.fromEntries(rows.map(row => [row.section, row.total])), { 1: 70, 2: 70, 3: 70, 4: 25 });
  await client.query('commit');
  console.log(JSON.stringify({ created, updated: roster.length - created, sectionCounts: Object.fromEntries(rows.map(row => [row.section, row.total])) }));
} catch (error) {
  await client.query('rollback');
  console.error(`Import rolled back (${error.code || error.name}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
