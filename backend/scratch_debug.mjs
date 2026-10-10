import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:S1234h5678%40@localhost:5432/gvpcew_attendance' });

const selectRows = `select t.id,t.academic_section_id section_id,t.day_of_week,t.start_time,t.end_time,t.status,t.entry_type,t.academic_year,
  su.code,su.name subject,u.full_name faculty,c.room_code classroom,d.name department,
  x.year_number,x.semester_number,x.section_name
  from timetable t join subjects su on su.id=t.subject_id join faculty f on f.id=t.faculty_id
  join users u on u.id=f.user_id join classrooms c on c.id=t.classroom_id
  join academic_sections x on x.id=t.academic_section_id join departments d on d.id=x.department_id`;

async function run() {
  const users = await pool.query(`select u.id, u.email, u.full_name, u.role, f.id as faculty_id from users u left join faculty f on f.user_id = u.id`);

  for (const user of users.rows) {
    if (user.email.endsWith('@faculty.invalid')) continue;
    const facRows = await pool.query(`${selectRows} where t.status='published' and t.faculty_id=(select id from faculty where user_id=$1) order by t.day_of_week,t.start_time`, [user.id]);

    const stuRows = await pool.query(`${selectRows} where t.status='published' and exists(
      select 1 from timetable assigned join faculty owner on owner.id=assigned.faculty_id
      where owner.user_id=$1 and assigned.academic_section_id=t.academic_section_id and assigned.status='published'
    ) order by x.year_number,x.semester_number,x.section_name,t.day_of_week,t.start_time`, [user.id]);

    console.log(`User: ${user.full_name} (${user.email}, role: ${user.role}, fac_id: ${user.faculty_id}) => /timetables/faculty: ${facRows.rows.length}, student-view: ${stuRows.rows.length}`);
  }

  // Also check what faculty_id values are in timetable table
  const distinctFacInT = await pool.query(`select distinct t.faculty_id, f.user_id, u.email, u.full_name from timetable t join faculty f on f.id = t.faculty_id join users u on u.id = f.user_id`);
  console.log('Distinct faculty in timetable table:', distinctFacInT.rows);

  await pool.end();
}

run().catch(console.error);
