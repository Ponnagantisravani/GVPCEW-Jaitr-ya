import { readFile } from 'node:fs/promises';
import { pool } from '../src/config/db.js';
try { await pool.query(await readFile(new URL('../../database/timetable-generator.sql',import.meta.url),'utf8')); console.log('Timetable generator tables created.'); } finally { await pool.end(); }
