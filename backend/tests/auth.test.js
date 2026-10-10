import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// No external database is contacted: simulate only the account lookup.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
const { pool } = await import('../src/config/db.js');
const { env } = await import('../src/config/env.js');
const { createApp } = await import('../src/app.js');

test('API authentication enforces current access and separates enrollment tokens', async t => {
  const originalQuery = pool.query;
  let roles = ['student'];
  let lookups = 0;
  pool.query = async () => {
    lookups++;
    return { rows: [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', full_name: 'Test Student',
      email: 'test@example.invalid', role: 'student', roles }] };
  };
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    await pool.end();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = claims => jwt.sign({ sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', ...claims }, env.jwtSecret, { expiresIn: '5m' });
  const get = (path, value) => fetch(base + path, { headers: value ? { Authorization: `Bearer ${value}` } : {} });

  assert.equal((await get('/health')).status, 200);
  assert.equal((await get('/auth/me')).status, 401);
  assert.equal((await get('/auth/me', 'invalid')).status, 401);
  assert.equal((await get('/auth/me', token({ purpose: 'face-enrollment', studentId: 'test' }))).status, 401);
  assert.equal(lookups, 0);

  const session = token({ roles: ['admin'] });
  const response = await get('/auth/me', session);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user.roles, ['student']);
  assert.equal((await get('/management/catalog', session)).status, 403);
  roles = [];
  assert.equal((await get('/auth/me', session)).status, 401);
  roles = ['faculty'];
  assert.equal((await get('/faculty/attendance-register?subjectId=invalid&month=2026-13', session)).status, 400);
  const subjectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const authLookup = pool.query;
  let assigned = false;
  let registerValues;
  pool.query = async (sql, values) => {
    if (sql.startsWith('select f.id from faculty')) return { rowCount: assigned ? 1 : 0, rows: assigned ? [{ id: 'faculty-id' }] : [] };
    if (sql.includes("to_char(a.attendance_date")) {
      registerValues = values;
      return { rows: [{ student_id: 'student-id', date: '2026-09-01', status: 'present' }] };
    }
    return authLookup(sql, values);
  };
  const registerPath = `/faculty/attendance-register?subjectId=${subjectId}&month=2026-09`;
  assert.equal((await get(registerPath, session)).status, 403);
  assigned = true;
  const register = await get(registerPath, session);
  assert.equal(register.status, 200);
  assert.deepEqual(registerValues, [subjectId, '2026-09-01', 'faculty-id']);
  assert.equal((await register.json()).attendance[0].status, 'present');
  const missing = await get('/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /json/);
});
