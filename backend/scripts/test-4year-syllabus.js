import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url) });
import pg from 'pg';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
assert.ok(url, 'Configure DATABASE_URL or TEST_DATABASE_URL.');

const schema = 'syllabus_split_test_' + randomBytes(8).toString('hex');
const admin = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL_MODE === 'require' ? { rejectUnauthorized: false } : false
});
await admin.connect();

let pool, server;
try {
  await admin.query('create schema ' + schema);
  const scoped = new URL(url);
  scoped.searchParams.set('options', '-c search_path=' + schema + ',public');
  process.env.DATABASE_URL = scoped.toString();
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'syllabus-split-test-secret';

  ({ pool } = await import('../src/config/db.js'));
  for (const file of ['schema.sql', 'syllabus.sql', 'production.sql', 'bluetooth-attendance.sql', 'reminders.sql', 'academic-access.sql']) {
    await pool.query(await readFile(new URL('../../database/' + file, import.meta.url), 'utf8'));
  }

  const { createApp } = await import('../src/app.js');
  const one = async (sql, args) => (await pool.query(sql, args)).rows[0];

  const cse = (await one("insert into departments(name) values('CSE') returning id")).id;
  const ece = (await one("insert into departments(name) values('ECE') returning id")).id;

  const sectionA = (await one("insert into academic_sections(department_id, year_number, semester_number, section_name, academic_year) values($1, 3, 5, 'CSE-A', '2026-2027') returning id", [cse])).id;
  const sectionECE = (await one("insert into academic_sections(department_id, year_number, semester_number, section_name, academic_year) values($1, 3, 5, 'ECE-A', '2026-2027') returning id", [ece])).id;

  // Create accounts
  const users = {}, faculty = {}, tokens = {};
  async function account(name, role, dept, sec) {
    const u = await one("insert into users(full_name, email, password_hash, role) values($1, $2, 'test-hash', $3) returning id", [name, name + '@gvpcew.ac.in', role === 'admin' ? 'admin' : role === 'faculty' ? 'faculty' : 'student']);
    users[name] = u.id;
    await pool.query('insert into user_roles(user_id, role) values($1, $2)', [u.id, role]);
    if (role === 'faculty') {
      faculty[name] = (await one('insert into faculty(user_id, department_id, employee_code) values($1, $2, $3) returning id', [u.id, dept, name])).id;
    }
    if (role === 'student') {
      await one("insert into students(user_id, department_id, roll_number, section, academic_section_id) values($1, $2, $3, 'A', $4) returning id", [u.id, dept, name, sec]);
    }
    tokens[name] = jwt.sign({ sub: u.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
  }

  await account('coord', 'academic_coordinator', cse);
  await account('teacher1', 'faculty', cse);
  await account('teacher2', 'faculty', cse);
  await account('eceTeacher', 'faculty', ece);
  await account('studentCSE', 'student', cse, sectionA);
  await account('studentECE', 'student', ece, sectionECE);

  await pool.query('insert into academic_coordinator_departments(user_id, department_id) values($1, $2)', [users.coord, cse]);

  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';

  async function call(user, method, path, body, expectStatus = 200) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Authorization: 'Bearer ' + tokens[user] } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    assert.equal(res.status, expectStatus, `Expected ${expectStatus} for ${method} ${path}, got ${res.status}: ${text}`);
    return data;
  }

  console.log('1. Verifying /syllabi/metadata endpoint...');
  const meta = await call('coord', 'GET', '/syllabi/metadata');
  assert.ok(meta.faculty.some(f => f.full_name === 'teacher1'));
  assert.ok(meta.sections.some(s => s.id === sectionA));

  console.log('2. Publishing 4-Year B.Tech Syllabus with Course-ID split courses...');
  const dummyPdf = Buffer.from('%PDF-1.4\n%Four Year Syllabus Mock Document\n%%EOF').toString('base64');
  const splitSubjects = [
    {
      course_code: '22CS3101',
      course_name: 'Design and Analysis of Algorithms',
      year_number: 3,
      semester_number: 5,
      semester: 'III Year - I Semester (Sem 5)',
      credits: '3',
      faculty_id: faculty.teacher1,
      unit_1: 'Introduction to Algorithms, Asymptotic notations',
      unit_2: 'Divide and Conquer approach, Recurrence relations',
      unit_3: 'Greedy Method and Dynamic Programming',
      unit_4: 'Backtracking and Branch & Bound',
      unit_5: 'NP-Hard and NP-Complete problems',
      course_outcomes: 'CO1: Analyze worst-case running times. CO2: Apply dynamic programming.',
      textbooks: 'Ellis Horowitz, Sartaj Sahni - Fundamentals of Computer Algorithms'
    },
    {
      course_code: '22CS3102',
      course_name: 'Operating Systems',
      year_number: 3,
      semester_number: 5,
      semester: 'III Year - I Semester (Sem 5)',
      credits: '3',
      faculty_id: faculty.teacher2,
      unit_1: 'OS Overview, Process Concepts',
      unit_2: 'CPU Scheduling & Synchronization',
      unit_3: 'Deadlocks and Prevention',
      unit_4: 'Memory Management and Virtual Memory',
      unit_5: 'File System and Disk Scheduling',
      course_outcomes: 'CO1: Explain OS primitives. CO2: Implement scheduling algorithms.',
      textbooks: 'Silberschatz, Galvin - Operating System Concepts'
    }
  ];

  const publishRes = await call('coord', 'POST', '/syllabi/publish-detected', {
    subjects: splitSubjects,
    sectionIds: [sectionA],
    batch: '2024–28',
    file_name: 'BTech_CSE_4Year_Curriculum.pdf',
    publishFullSyllabus: true,
    fullTitle: 'B.Tech. CSE — 4-Year Autonomous Scheme and Syllabi',
    pdf: dummyPdf
  }, 201);

  assert.equal(publishRes.syllabi.length, 3);
  assert.ok(publishRes.masterSyllabus);
  assert.equal(publishRes.masterSyllabus.title, 'B.Tech. CSE — 4-Year Autonomous Scheme and Syllabi');

  console.log('3. Verifying student access to 4-Year B.Tech Syllabus...');
  const studentView = await call('studentCSE', 'GET', '/syllabi');
  assert.equal(studentView.syllabi.length, 3);
  const masterDoc = studentView.syllabi.find(s => !s.subject_id);
  assert.ok(masterDoc, 'Student must see the 4-year complete syllabus document');
  assert.equal(masterDoc.file_name, 'BTech_CSE_4Year_Curriculum.pdf');

  const eceStudentView = await call('studentECE', 'GET', '/syllabi');
  assert.equal(eceStudentView.syllabi.length, 0, 'ECE student must not see CSE syllabi');

  console.log('4. Verifying faculty recipient distribution...');
  const teacher1View = await call('teacher1', 'GET', '/syllabi');
  assert.ok(teacher1View.syllabi.some(s => s.title === 'Design and Analysis of Algorithms'));
  assert.ok(!teacher1View.syllabi.some(s => s.title === 'Operating Systems'), 'teacher1 should not see Operating Systems assigned to teacher2');

  const teacher2View = await call('teacher2', 'GET', '/syllabi');
  assert.ok(teacher2View.syllabi.some(s => s.title === 'Operating Systems'));
  assert.ok(!teacher2View.syllabi.some(s => s.title === 'Design and Analysis of Algorithms'));

  const eceTeacherView = await call('eceTeacher', 'GET', '/syllabi');
  assert.equal(eceTeacherView.syllabi.length, 0);

  console.log('5. Verifying PDF streaming and permissions...');
  const pdfStreamRes = await fetch(base + '/syllabi/' + masterDoc.id + '/pdf', {
    headers: { Authorization: 'Bearer ' + tokens.studentCSE }
  });
  assert.equal(pdfStreamRes.status, 200);
  assert.equal(pdfStreamRes.headers.get('content-type'), 'application/pdf');

  console.log('6. Verifying notifications...');
  const notifications = (await pool.query('select * from notifications')).rows;
  assert.ok(notifications.length > 0, 'Notifications must be sent to students and assigned faculty');

  console.log('PASS: 4-Year B.Tech syllabus upload, Course-ID splitting, faculty recipient assignment, and student distribution verified successfully!');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  await admin.query('drop schema if exists ' + schema + ' cascade');
  await admin.end();
}
