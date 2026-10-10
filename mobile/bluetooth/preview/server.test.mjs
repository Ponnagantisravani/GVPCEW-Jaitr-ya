import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from './server.mjs';

test('local class handles closed sessions, ten simultaneous submissions, duplicates and invalid requests', async () => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  async function post(path, data, origin = base) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }
  // Minimal JPEG-shaped fixture tests request transport, not image decoding or face detection.
  const fixture = Buffer.alloc(150, 0); fixture[0] = 255; fixture[1] = 216; fixture[148] = 255; fixture[149] = 217;
  const photo = 'data:image/jpeg;base64,' + fixture.toString('base64');
  try {
    assert.equal((await post('/api/attendance', { studentId: 'TEST01', photo })).status, 409);
    const opened = await post('/api/open', {});
    assert.equal(opened.status, 200);
    const sessionId = opened.body.session.id;
    assert.equal((await post('/api/open', {})).status, 409);
    assert.equal((await post('/api/attendance', { sessionId, studentId: '<script>', photo })).status, 400);
    assert.equal((await post('/api/attendance', { sessionId, studentId: 'TEST01', photo: 'bad' })).status, 400);
    assert.equal((await post('/api/close', { sessionId }, 'https://other.example')).status, 403);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => post('/api/attendance', { sessionId, studentId: 'TEST' + i, photo })));
    assert.ok(results.every(result => result.status === 200));
    const state = await (await fetch(base + '/api/state')).json();
    assert.equal(state.records.length, 10);
    assert.ok(state.records.every(record => !('photo' in record)));
    const image = await fetch(base + '/api/photo/' + state.records[0].recordId);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), fixture);
    assert.equal((await post('/api/attendance', { sessionId, studentId: 'TEST0', photo })).body.replaced, true);
    assert.equal((await (await fetch(base + '/api/state')).json()).records.length, 10);
    assert.equal((await post('/api/close', { sessionId })).status, 200);
    assert.equal((await post('/api/attendance', { sessionId, studentId: 'TEST10', photo })).status, 409);
    await post('/api/open', {});
    assert.equal((await (await fetch(base + '/api/state')).json()).records.length, 0);
    assert.equal((await post('/api/attendance', { sessionId, studentId: 'TEST11', photo })).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
