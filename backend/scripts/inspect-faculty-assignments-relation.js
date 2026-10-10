import { pool } from '../src/config/db.js';

try {
  const { rows } = await pool.query(`select c.relkind,c.relname,pg_get_viewdef(c.oid,true) definition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='faculty_assignments'`);
  console.log(JSON.stringify(rows, null, 2));
} finally { await pool.end(); }
