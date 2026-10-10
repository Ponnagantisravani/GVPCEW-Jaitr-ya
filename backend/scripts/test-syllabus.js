// Integration checks run inside an outer transaction. All test syllabi and
// notifications are rolled back; existing college data is preserved.
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url) });
const { pool } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { createApp } = await import('../src/app.js');
const { default: jwt } = await import('jsonwebtoken');
const { default: assert } = await import('node:assert/strict');
const client = await pool.connect();
const originalQuery = pool.query;
const originalConnect = pool.connect;
let server;
try {
  await client.query('begin');
  const { rows: users } = await client.query('select id from users limit 1');
  assert.ok(users[0], 'At least one user is required for integration checks');
  pool.query = (...args) => client.query(...args);
  let failNotifications = false;
  pool.connect = async () => ({
    release() {},
    query(sql, values) {
      if (sql === 'begin') return client.query('savepoint syllabus_publish');
      if (sql === 'commit') return client.query('release savepoint syllabus_publish');
      if (sql === 'rollback') return client.query('rollback to savepoint syllabus_publish');
      if (failNotifications && sql.includes('insert into notifications')) throw new Error('Simulated notification failure');
      return client.query(sql, values);
    }
  });
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/syllabi`;
  const tokens = Object.fromEntries(['student', 'faculty', 'academic_coordinator'].map(role => [role, jwt.sign({ sub: users[0].id, roles: [role] }, env.jwtSecret, { expiresIn: '5m' })]));
  async function request(role, path = '', method = 'GET', data) {
    // Authorization reads current database roles, not the JWT role claim.
    // These assignments are contained in the outer rollback transaction.
    if (role) {
      await client.query('delete from user_roles where user_id=$1', [users[0].id]);
      await client.query('insert into user_roles(user_id,role) values($1,$2)', [users[0].id, role]);
    }
    return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  }
  const course = { code: 'TEST01', category: 'PC', title: 'Integration test course', l: '3', p: '0', internal: '30', external: '70', total: '100', credits: '3', units: 'UNIT I\nTest contents' };
  const payload = { title: 'Syllabus integration test', department: 'TEST', batch: 'Test batch', structure: { semesters: [{ name: 'I Year - I Semester', courses: [course] }] } };
  assert.equal((await request(null)).status, 401);
  assert.equal((await request('faculty', '', 'POST', payload)).status, 403);
  assert.equal((await request('student', '', 'POST', payload)).status, 403);
  assert.equal((await request('academic_coordinator', '', 'POST', { ...payload, structure: { semesters: [] } })).status, 400);
  assert.equal((await request('academic_coordinator', '', 'POST', { ...payload, structure: { semesters: [{ name: 'I', courses: [{ ...course, credits: '-2' }] }] } })).status, 400);
  let response = await request('academic_coordinator', '', 'POST', payload);
  assert.equal(response.status, 201);
  const draft = (await response.json()).syllabus;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.structure.semesters[0].courses[0].units, course.units);
  assert.ok(!(await (await request('student', '?manage=true')).json()).syllabi.some(row => row.id === draft.id));
  assert.ok((await (await request('academic_coordinator', '?manage=true')).json()).syllabi.some(row => row.id === draft.id));
  assert.equal((await request('student', `/${draft.id}/publish`, 'POST')).status, 403);
  assert.equal((await request('student', `/${draft.id}`, 'PUT', payload)).status, 403);
  const edited = { ...payload, title: 'Edited test syllabus' };
  response = await request('academic_coordinator', `/${draft.id}`, 'PUT', edited);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).syllabus.title, edited.title);
  const before = Number((await client.query('select count(*) from notifications')).rows[0].count);
  failNotifications = true;
  assert.equal((await request('academic_coordinator', `/${draft.id}/publish`, 'POST')).status, 500);
  assert.equal((await client.query('select status from syllabi where id=$1', [draft.id])).rows[0].status, 'draft');
  failNotifications = false;
  assert.equal((await request('academic_coordinator', `/${draft.id}/publish`, 'POST')).status, 200);
  const students = Number((await client.query('select count(distinct user_id) from students')).rows[0].count);
  assert.equal(Number((await client.query('select count(*) from notifications')).rows[0].count), before + students);
  assert.ok((await (await request('student')).json()).syllabi.some(row => row.id === draft.id));
  assert.equal((await request('academic_coordinator', `/${draft.id}/publish`, 'POST')).status, 409);
  assert.equal((await request('academic_coordinator', `/${draft.id}`, 'PUT', edited)).status, 409);
  assert.equal((await request('student', `/${draft.id}/pdf`)).status, 404);
  const pdf = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
  const upload = { title: 'Uploaded test PDF', department: 'TEST', batch: 'Test', file_name: 'test.pdf', pdf };
  assert.equal((await request('academic_coordinator', '', 'POST', { ...upload, pdf: Buffer.from('invalid').toString('base64') })).status, 400);
  response = await request('academic_coordinator', '', 'POST', upload);
  assert.equal(response.status, 201);
  const uploaded = (await response.json()).syllabus;
  assert.equal((await request('student', `/${uploaded.id}/pdf`)).status, 404);
  assert.equal((await request('academic_coordinator', `/${uploaded.id}/pdf`)).status, 200);
  assert.equal((await request('academic_coordinator', `/${uploaded.id}/publish`, 'POST')).status, 200);
  response = await request('student', `/${uploaded.id}/pdf`);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(await response.text(), Buffer.from(pdf, 'base64').toString());
  assert.equal((await request('student', '/invalid/pdf')).status, 400);
  console.log('PASS: draft editing, validation, publication, notifications, rollback on failure, PDF access and student permissions.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = originalQuery; pool.connect = originalConnect;
  await client.query('rollback'); client.release(); await pool.end();
}
