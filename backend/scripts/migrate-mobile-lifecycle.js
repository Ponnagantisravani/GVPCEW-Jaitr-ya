import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL)});
let begun=false;
try{await c.connect();await c.query('begin');begun=true;await c.query("select pg_advisory_xact_lock(hashtext('gvpcew-migrations'))");await c.query(await readFile(new URL('../../database/mobile-attendance-lifecycle.sql',import.meta.url),'utf8'));await c.query('commit');console.log('Mobile attendance lifecycle migration applied.');}catch(e){if(begun)await c.query('rollback').catch(()=>{});throw e;}finally{await c.end();}
