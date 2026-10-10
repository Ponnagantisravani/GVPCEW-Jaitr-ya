import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export function createPreviewServer() {
  let session = null;
  const records = new Map();
  const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'] };
  function active() {
    if (session && session.expiresAt <= Date.now()) session = null;
    return session;
  }
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    function json(code, body) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && files[path]) {
        const [file, type] = files[path];
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
        res.end(await readFile(new URL(file, import.meta.url))); return;
      }
      if (req.method === 'GET' && path === '/api/state') {
        json(200, { session: active(), records: [...records.values()].map(({ photo, ...record }) => record) }); return;
      }
      if (req.method === 'GET' && path.startsWith('/api/photo/')) {
        const record = [...records.values()].find(r => r.recordId === path.slice('/api/photo/'.length));
        if (!record) { json(404, { error: 'Photo not found.' }); return; }
        res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.end(Buffer.from(record.photo, 'base64')); return;
      }
      if (req.method !== 'POST') { json(404, { error: 'Not found.' }); return; }
      if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) {
        json(403, { error: 'Use the preview on this computer.' }); return;
      }
      if (!req.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'JSON required.' }); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 800_000) { json(413, { error: 'Photo too large. Please retry.' }); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { json(400, { error: 'Invalid request.' }); return; }
      if (path === '/api/open') {
        if (active()) { json(409, { error: 'A class is already open. Close it before starting another.' }); return; }
        session = { id: randomUUID(), expiresAt: Date.now() + 300_000 };
        records.clear(); json(200, { session }); return;
      }
      if (path === '/api/close') {
        if (!active() || session.id !== body.sessionId) { json(409, { error: 'This class has already ended.' }); return; }
        session = null; json(200, { ok: true }); return;
      }
      if (path === '/api/attendance') {
        if (!active() || body.sessionId !== session.id) { json(409, { error: 'Class closed or changed. Ask the coordinator to open a class and try again.' }); return; }
        if (typeof body.studentId !== 'string' || !/^[A-Z0-9_-]{1,10}$/.test(body.studentId)) { json(400, { error: 'Enter a valid student ID.' }); return; }
        if (typeof body.photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) { json(400, { error: 'A camera photo is required.' }); return; }
        const photo = body.photo.split(',')[1];
        const decoded = Buffer.from(photo, 'base64');
        if (decoded.length < 100 || decoded[0] !== 255 || decoded[1] !== 216 || decoded[decoded.length - 2] !== 255 || decoded[decoded.length - 1] !== 217) {
          json(400, { error: 'The photo is incomplete. Capture again.' }); return;
        }
        const key = body.studentId;
        if (records.size >= 100 && !records.has(key)) { json(409, { error: 'Demo class limit reached (100 records).' }); return; }
        const existing = records.get(key);
        const record = { recordId: existing?.recordId || randomUUID(), studentId: key, recordedAt: Date.now(), status: 'Pending verification', photo };
        records.set(key, record);
        json(200, { recordId: record.recordId, studentId: key, replaced: !!existing }); return;
      }
      json(404, { error: 'Not found.' });
    } catch { if (!res.headersSent) json(500, { error: 'Preview server error. Please try again.' }); else res.end(); }
  });
}
