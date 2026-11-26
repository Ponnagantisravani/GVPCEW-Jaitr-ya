import dotenv from 'dotenv';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {getSslConfig} from '../src/utils/dbAdmin.js';
dotenv.config({path:new URL('../.env',import.meta.url)});
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is missing in backend/.env');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:getSslConfig(process.env.DATABASE_URL,process.env.DATABASE_SSL_MODE||'')});
try{await db.connect();await db.query(await readFile(new URL('../../database/hod-preferences.sql',import.meta.url),'utf8'));console.log('HOD and faculty preference migration applied.');}finally{await db.end();}
