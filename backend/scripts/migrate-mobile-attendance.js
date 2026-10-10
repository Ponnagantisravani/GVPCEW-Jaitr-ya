import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL)});
try{await c.connect();await c.query('begin');await c.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");await c.query(await readFile(new URL('../../database/mobile-attendance.sql',import.meta.url),'utf8'));await c.query('commit');console.log('Mobile attendance migration applied.');}catch(e){await c.query('rollback');throw e;}finally{await c.end();}
