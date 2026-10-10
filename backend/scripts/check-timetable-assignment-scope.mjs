import assert from 'node:assert/strict';
import {pool} from '../src/config/db.js';
import {effectiveFacultyAssignments} from '../src/services/teachingAssignments.js';
const db=await pool.connect();
try {
 await db.query('begin');
 await db.query('create temporary table timetable(id text,faculty_id text,academic_section_id text,subject_id text,status text) on commit drop');
 await db.query('create temporary table faculty_section_assignments(id text,faculty_id text,academic_section_id text,subject_id text,status text) on commit drop');
 await db.query("insert into faculty_section_assignments values('old','old-owner','live','subject','active'),('manual','manual-owner','unpublished','subject','active'),('deepthi','assigned-owner','live','unpublished-subject','active')");
 await db.query("insert into timetable values('one','new-owner','live','subject','published'),('two','new-owner','live','subject','published'),('shared','second-owner','live','subject','published'),('draft','draft-owner','draft-section','subject','draft')");
 const rows=(await db.query(`select faculty_id,academic_section_id from ${effectiveFacultyAssignments} assigned order by faculty_id`)).rows;
 assert.deepEqual(rows,[{faculty_id:'assigned-owner',academic_section_id:'live'},{faculty_id:'manual-owner',academic_section_id:'unpublished'},{faculty_id:'new-owner',academic_section_id:'live'},{faculty_id:'second-owner',academic_section_id:'live'}]);
 console.log('Passed: assignments remain visible when other subjects in the same section are published; published subject owners override stale assignments; repeated periods deduplicate; shared faculty retain access; drafts grant no access.');
}finally{await db.query('rollback');db.release();await pool.end();}
