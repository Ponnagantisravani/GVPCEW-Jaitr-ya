import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pool} from '../src/config/db.js';
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const schema=`timetable_test_${Date.now()}`;
 await client.query(`CREATE SCHEMA ${schema}`);
 await client.query(`SET LOCAL search_path TO ${schema}, public`);
 const migration=await readFile(new URL('../../database/timetable-generator.sql',import.meta.url),'utf8');
 await client.query(migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
 const {rows}=await client.query("INSERT INTO timetable_versions(name,input) VALUES('test','{}') RETURNING id");
 const id=rows[0].id;
 const insert=(section,teacher,room,period=1)=>client.query("INSERT INTO timetable_slots(version_id,section,day,period,subject,teachers,room,kind,span_start,span_len) VALUES($1,$2,0,$3,'CN',$4,$5,'theory',$3,1)",[id,section,period,teacher,room]);
 await insert('1',['A','B'],['LAB1','LAB2']);
 for(const [section,teachers,rooms] of [['2',['B'],['ROOM2']],['3',['C'],['LAB2']],['1',['D'],['ROOM4']]]){
  await client.query('SAVEPOINT clash');
  await assert.rejects(()=>insert(section,teachers,rooms),e=>e.code==='23505');
  await client.query('ROLLBACK TO SAVEPOINT clash');
 }
 await insert('2',['C'],['ROOM2'],2);
 await client.query("UPDATE timetable_versions SET status='published' WHERE id=$1",[id]);
 await client.query('SAVEPOINT immutable');
 await assert.rejects(()=>insert('3',['D'],['ROOM3'],3),e=>e.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT immutable');
 console.log('Migration, multi-teacher/multi-room uniqueness, section uniqueness and published-version immutability passed.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();}
