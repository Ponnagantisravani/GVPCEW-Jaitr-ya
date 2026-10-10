import { pool } from '../src/config/db.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

async function test() {
  const coord = await pool.query(`
    select u.id, u.email, ur.role 
    from users u 
    join user_roles ur on ur.user_id = u.id 
    where ur.role = 'academic_coordinator' 
    limit 1
  `);

  const token = jwt.sign(
    { sub: coord.rows[0].id, roles: ['academic_coordinator'], activeRole: 'academic_coordinator' },
    env.jwtSecret,
    { expiresIn: '1h' }
  );

  const sec = await pool.query("select id from academic_sections where year_number = 2 and section_name = '1' limit 1");
  const sectionId = sec.rows[0].id;

  const res = await fetch('http://localhost:4000/api/syllabi/publish-detected', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      sectionIds: [sectionId],
      batch: '2024–25 onwards',
      file_name: 'test_syllabus.pdf',
      publishFullSyllabus: false,
      subjects: [
        {
          course_code: '24CT11RC12',
          course_name: 'Database Management Systems',
          year_number: 2,
          semester_number: 3,
          category: 'PC',
          course_outcomes: 'CO1: Understand DBMS',
          unit_1: 'Unit 1 overview',
          unit_2: 'Unit 2 overview',
          unit_3: 'Unit 3 overview',
          unit_4: 'Unit 4 overview',
          unit_5: 'Unit 5 overview',
          textbooks: 'Korth DBMS',
          reference_books: 'Navathe',
          web_references: 'nptel.ac.in'
        }
      ]
    })
  });

  console.log('Status code:', res.status);
  const json = await res.json();
  console.log('Response body:', JSON.stringify(json, null, 2));

  await pool.end();
}

test().catch(console.error);
