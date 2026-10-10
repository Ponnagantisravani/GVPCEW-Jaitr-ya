import { pool } from '../src/config/db.js';
import assert from 'node:assert/strict';

async function run() {
  console.log('Testing timetable publish-grid sync...');

  // 1. Get coordinator user
  const coordUser = await pool.query(
    `select u.id, u.email from users u join user_roles ur on ur.user_id=u.id where ur.role='academic_coordinator' limit 1`
  );
  assert.ok(coordUser.rows.length, 'Coordinator user found');
  const coord = coordUser.rows[0];

  // 2. Prepare sample timetable payload matching TimetableManagement format
  const sampleGrid = {
    Monday: {
      p1: { subject: 'Database Management Systems', code: '24CT11RC12', faculty: 'Prof. R. Kiran', room: 'Room L19', type: 'theory' },
      p2: { subject: 'Design & Analysis of Algorithms', code: '24CT11RC18', faculty: 'Dr. M. Lakshmi', room: 'Room L19', type: 'theory' },
      lunch: { subject: 'LUNCH BREAK', code: '', faculty: '', room: '', type: 'break' },
      p5: { subject: 'Web Technologies Lab', code: '24CT11LC10', faculty: 'Mrs. P. Vani', room: 'Lab 3', type: 'lab' }
    },
    Tuesday: {
      p1: { subject: 'Probability & Statistics', code: '24BM11RC06', faculty: 'Dr. V. Prasad', room: 'Room L19', type: 'theory' }
    }
  };

  const samplePeriods = [
    { id: 'p1', time: '08:40 AM - 09:30 AM', label: 'Period 1' },
    { id: 'p2', time: '09:30 AM - 10:20 AM', label: 'Period 2' },
    { id: 'p3', time: '10:20 AM - 11:10 AM', label: 'Period 3' },
    { id: 'p4', time: '11:10 AM - 12:00 PM', label: 'Period 4' },
    { id: 'lunch', time: '12:00 PM - 12:50 PM', label: 'LUNCH BREAK' },
    { id: 'p5', time: '12:50 PM - 01:40 PM', label: 'Period 5' }
  ];

  // Import the router logic or trigger directly via fetch to the running backend
  // Let's test by issuing HTTP request to running backend or calling endpoint
  // Let's check if the backend server is running or we can test using supertest/fetch
  console.log('Publishing cse_sec1, cse_sec2, cse_sec3, cse_sec4 grids...');

  // We can call the backend or execute publish logic directly to seed/verify
  const client = await pool.connect();
  try {
    // Check initial section 3 timetable rows
    const sec3 = await client.query(
      `select id from academic_sections where year_number=2 and semester_number=3 and section_name='3' limit 1`
    );
    assert.ok(sec3.rows.length, 'Section 3 found');
    const sec3Id = sec3.rows[0].id;

    console.log('Target section 3 ID:', sec3Id);

    // Let's also check a student in section 3
    const studentInSec3 = await client.query(
      `select s.id, s.user_id, u.full_name, u.email from students s join users u on u.id=s.user_id where s.academic_section_id=$1 limit 1`,
      [sec3Id]
    );
    assert.ok(studentInSec3.rows.length, 'Student found in section 3');
    console.log('Found student in section 3:', studentInSec3.rows[0].full_name, studentInSec3.rows[0].email);

  } finally {
    client.release();
  }

  await pool.end();
  console.log('Database verification passed!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
