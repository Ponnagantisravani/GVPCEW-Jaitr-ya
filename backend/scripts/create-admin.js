import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSslConfig } from '../src/utils/dbAdmin.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const parsed = z.object({
  DATABASE_URL: z.string().url(),
  ADMIN_NAME: z.string().trim().min(2).max(120),
  ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  ADMIN_PASSWORD: z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72)
}).safeParse(process.env);

if (!parsed.success) {
  console.error('Set DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters, at most 72 UTF-8 bytes).');
  process.exitCode = 1;
} else {
  const settings = parsed.data;
  const client = new pg.Client({ connectionString: settings.DATABASE_URL,
    ssl: getSslConfig(settings.DATABASE_URL), connectionTimeoutMillis: 10000, query_timeout: 15000 });
  let transaction = false;
  try {
    await client.connect();
    await client.query('begin');
    transaction = true;
    await client.query("select pg_advisory_xact_lock(hashtext('gvpcew-create-admin'))");
    const existing = await client.query('select id from users where lower(email)=$1', [settings.ADMIN_EMAIL]);
    if (existing.rowCount) throw Object.assign(new Error(), { code: 'ACCOUNT_EXISTS' });
    const passwordHash = await bcrypt.hash(settings.ADMIN_PASSWORD, 12);
    const { rows } = await client.query("insert into users(full_name,email,password_hash,role) values($1,$2,$3,'admin') returning id",
      [settings.ADMIN_NAME, settings.ADMIN_EMAIL, passwordHash]);
    await client.query("insert into user_roles(user_id,role) values($1,'admin')", [rows[0].id]);
    await client.query('commit');
    transaction = false;
    console.log('Administrator created. Sign in and select the admin role.');
  } catch (error) {
    if (transaction) await client.query('rollback');
    console.error(error.code === 'ACCOUNT_EXISTS' || error.code === '23505'
      ? 'That account already exists. No password or permissions were changed.'
      : `Administrator creation failed (${error.code || error.name}). Check the database connection and run db:migrate:production first.`);
    process.exitCode = 1;
  } finally { await client.end(); }
}
