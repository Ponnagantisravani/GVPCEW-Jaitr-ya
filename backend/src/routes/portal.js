import { Router } from '../utils/router.js';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { studentGroups } from '../config/studentGroups.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import {managementScope,manageDepartmentScope,sectionScope,teachingScope,subjectScope,noticeScope} from '../services/portalScope.js';

export const portalRouter = Router();
const portalRoles = ['admin', 'faculty', 'academic_coordinator', 'student', 'student_coordinator'];
const manageableRoles = ['student', 'student_coordinator', 'faculty', 'academic_coordinator'];

// Faculty workspaces are keyed by `faculty.id`, not just the role mapping. Keep
// the profile in place whenever an administrator grants faculty access.
async function ensureFacultyProfile(client, userId) {
  await client.query(
    `insert into faculty(user_id, employee_code, department_id)
     select $1, 'AUTO-' || $1::text,
       (select department_id from students where user_id=$1)
     where not exists (select 1 from faculty where user_id=$1)
     on conflict (user_id) do nothing`,
    [userId]
  );
}

portalRouter.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const role = req.query.role;
    const roles = req.user.roles || [req.user.role];
    if (!roles.includes(role)) return res.status(403).json({ message: 'This role is not assigned to your account.' });
    const args=[req.user.sub,role];
    const [students, faculty, subjects, sessions, notices] = await Promise.all([
      pool.query(`select count(*)::int total from students s where ${manageDepartmentScope('s.department_id')} or ($2='faculty' and ${teachingScope('s.academic_section_id')}) or ($2='student' and s.user_id=$1) or ($2='student_coordinator' and ${sectionScope('s.academic_section_id')})`,args),
      pool.query(`select count(*)::int total from faculty f where ${manageDepartmentScope('f.department_id')} or ($2='faculty' and f.user_id=$1) or ($2 in ('student','student_coordinator') and exists(select 1 from timetable t where t.faculty_id=f.id and t.status='published' and ${sectionScope('t.academic_section_id')}))`,args),
      pool.query(`select count(*)::int total from subjects s where ${subjectScope('s')}`,args),
      pool.query(`select count(*)::int total from attendance_sessions a where stopped_at is null and expires_at>now() and (${manageDepartmentScope('(select department_id from academic_sections where id=a.academic_section_id)')} or ($2='faculty' and a.coordinator_user_id=$1) or ($2 in ('student','student_coordinator') and ${sectionScope('a.academic_section_id')}))`,args),
      pool.query(`select count(*)::int total from notices n where (expires_at is null or expires_at>now()) and ${noticeScope('n')}`,args)
    ]);
    const values = { students: students.rows[0].total, faculty: faculty.rows[0].total, subjects: subjects.rows[0].total, sessions: sessions.rows[0].total, notices: notices.rows[0].total };
    res.json({ values });
  } catch (error) {
    next(error);
  }
});
portalRouter.get('/subjects', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select s.id,s.code,s.name,d.name department,u.full_name faculty from subjects s left join departments d on d.id=s.department_id left join faculty f on f.id=s.faculty_id left join users u on u.id=f.user_id where ${subjectScope('s')} order by s.code`,[req.user.sub,req.user.activeRole]);
  res.json({ subjects: rows });
});
portalRouter.get('/timetable', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select t.id,t.day_of_week,t.start_time,t.end_time,t.status,t.academic_section_id section_id,t.academic_year,x.year_number,x.semester_number,x.section_name,d.name department,s.code,s.name subject,c.room_code classroom,u.full_name faculty from timetable t join academic_sections x on x.id=t.academic_section_id join departments d on d.id=x.department_id join subjects s on s.id=t.subject_id join classrooms c on c.id=t.classroom_id join faculty f on f.id=t.faculty_id join users u on u.id=f.user_id where ${manageDepartmentScope('x.department_id')} or (t.status='published' and (($2='faculty' and f.user_id=$1) or ($2 in ('student','student_coordinator') and ${sectionScope('t.academic_section_id')}))) order by t.day_of_week,t.start_time`,[req.user.sub,req.user.activeRole]);
  res.json({ timetable: rows });
});
portalRouter.get('/users', requireAuth, allowRoles('admin'), async (_req, res) => {
  const { rows } = await pool.query(`select u.id,u.full_name,u.email,u.role,u.created_at,coalesce(array_agg(ur.role) filter(where ur.role is not null),'{}'::text[]) roles from users u left join user_roles ur on ur.user_id=u.id group by u.id order by u.full_name`);
  res.json({ users: rows });
});
portalRouter.patch('/users/:id/roles', requireAuth, allowRoles('admin'), async (req, res) => {
  const requestedRoles = Array.isArray(req.body?.roles)
    ? [...new Set(req.body.roles.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];

  const invalidRoles = requestedRoles.filter((role) => !portalRoles.includes(role));
  if (invalidRoles.length) {
    return res.status(400).json({ message: `Invalid portal role: ${invalidRoles[0]}` });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const existingUser = await client.query('select id from users where id=$1 for update', [req.params.id]);
    if (!existingUser.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'User account was not found.' });
    }

    if (req.user.sub === req.params.id && !requestedRoles.includes('admin')) {
      await client.query('rollback');
      return res.status(400).json({ message: 'You cannot remove admin access from your own account.' });
    }

    await client.query('delete from user_roles where user_id=$1', [req.params.id]);
    for (const role of requestedRoles) {
      await client.query('insert into user_roles(user_id, role) values($1, $2)', [req.params.id, role]);
    }
    if (requestedRoles.includes('faculty')) await ensureFacultyProfile(client, req.params.id);

    if(!requestedRoles.includes('academic_coordinator')){await client.query('delete from academic_coordinator_departments where user_id=$1',[req.params.id]);await client.query('delete from academic_institution_access where user_id=$1',[req.params.id]);}
    if(!requestedRoles.includes('student_coordinator'))await client.query('delete from student_coordinator_sections where user_id=$1',[req.params.id]);
    const primaryRole = requestedRoles.includes('admin')
      ? 'admin'
      : requestedRoles.includes('faculty')
      ? 'faculty'
      : 'student';

    const { rows } = await client.query(
      `update users u
       set role=$2
       where u.id=$1
       returning u.id,u.full_name,u.email,u.role,u.created_at,
         (select array_agg(ur.role order by ur.role) from user_roles ur where ur.user_id=u.id) roles`,
      [req.params.id, primaryRole]
    );

    await client.query('commit');
    res.json({ user: rows[0] });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});
async function resolveStudentDepartment(client, name) {
  const normalized = name?.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  await client.query("select pg_advisory_xact_lock(hashtext('student-department:' || lower($1)))", [normalized]);
  const existing = await client.query('select id from departments where lower(name)=lower($1)', [normalized]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query('insert into departments(name) values($1) returning id', [normalized]);
  return created.rows[0].id;
}

portalRouter.get('/admin/people', requireAuth, allowRoles('admin'), async (req, res) => {
  const role = String(req.query.role || '');
  if (!manageableRoles.includes(role)) return res.status(400).json({ message: 'Choose a valid management section.' });
  const { rows } = await pool.query(
    `select u.id,u.full_name,u.email,u.created_at,s.roll_number,s.section,case when $1='faculty' then fd.name else d.name end department,f.employee_code
     from users u
     join user_roles ur on ur.user_id=u.id and ur.role=$1
     left join students s on s.user_id=u.id
     left join departments d on d.id=s.department_id
     left join faculty f on f.user_id=u.id
     left join departments fd on fd.id=f.department_id and $1='faculty'
     order by u.full_name`,
    [role]
  );
  const departments = await pool.query('select name from departments order by name');
  res.json({ people: rows, departments: [...new Set([...studentGroups.map(group => group.department), ...departments.rows.map(row => row.name)])], groups: studentGroups });
});

portalRouter.post('/admin/people', requireAuth, allowRoles('admin'), async (req, res) => {
  const { fullName, email, password, role, rollNumber, section, employeeCode, department } = req.body || {};
  if (department !== undefined && (typeof department !== 'string' || department.trim().length > 120)) return res.status(400).json({ message: 'Provide a branch name of at most 120 characters.' });
  if (!fullName?.trim() || !email?.trim() || !password || password.length < 8 || !manageableRoles.includes(role)) {
    return res.status(400).json({ message: 'Provide name, email, a password of at least 8 characters, and a valid section.' });
  }
  if (['student', 'student_coordinator'].includes(role) && !rollNumber?.trim()) return res.status(400).json({ message: 'A roll number is required for students.' });
  if (role === 'faculty' && !employeeCode?.trim()) return res.status(400).json({ message: 'An employee code is required for faculty.' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await client.query(
      `insert into users(full_name,email,password_hash,role) values($1,$2,$3,$4) returning id,full_name,email`,
      [fullName.trim(), email.trim().toLowerCase(), passwordHash, role === 'faculty' ? 'faculty' : 'student']
    );
    const userId = user.rows[0].id;
    await client.query('insert into user_roles(user_id,role,assigned_by) values($1,$2,$3)', [userId, role, req.user.sub]);
    if (['student', 'student_coordinator'].includes(role)) {
      const departmentId = await resolveStudentDepartment(client, department);
      await client.query(`insert into students(user_id,roll_number,section,department_id,face_enrollment_status) values($1,$2,$3,$4,'pending')`, [userId, rollNumber.trim(), section?.trim().toUpperCase() || 'A', departmentId]);
    }
    if (role === 'faculty') {
      const departmentId = await resolveStudentDepartment(client, department);
      await client.query('insert into faculty(user_id,employee_code,department_id) values($1,$2,$3)', [userId, employeeCode.trim(), departmentId]);
    }
    await client.query('commit');
    res.status(201).json({ person: user.rows[0] });
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505') return res.status(409).json({ message: 'That email, roll number, or employee code is already in use.' });
    throw error;
  } finally {
    client.release();
  }
});

portalRouter.patch('/admin/people/:id', requireAuth, allowRoles('admin'), async (req, res) => {
  const { fullName, email, rollNumber, section, employeeCode, department, password } = req.body || {};
  if (password && (typeof password !== 'string' || password.length < 8)) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
  if (department !== undefined && (typeof department !== 'string' || department.trim().length > 120)) return res.status(400).json({ message: 'Provide a branch name of at most 120 characters.' });
  if (!fullName?.trim() || !email?.trim()) return res.status(400).json({ message: 'Name and email are required.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const account = await client.query('update users set full_name=$2,email=$3 where id=$1 returning id', [req.params.id, fullName.trim(), email.trim().toLowerCase()]);
    if (!account.rowCount) {
      await client.query('rollback');
      return res.status(404).json({ message: 'User account was not found.' });
    }
    if (password) await client.query('update users set password_hash=$2 where id=$1', [req.params.id, await bcrypt.hash(password, 12)]);
    if (rollNumber?.trim()) {
      const departmentId = await resolveStudentDepartment(client, department);
      const updatedStudent = await client.query(`update students set roll_number=$2,section=$3,
        academic_section_id=case when section<>$3 or ($5 and department_id is distinct from $4::uuid) then null else academic_section_id end,
        department_id=case when $5 then $4::uuid else department_id end where user_id=$1`,
        [req.params.id, rollNumber.trim(), section?.trim().toUpperCase() || 'A', departmentId, department !== undefined]);
      if (!updatedStudent.rowCount) {
        const studentRole = await client.query("select 1 from user_roles where user_id=$1 and role in ('student','student_coordinator')", [req.params.id]);
        if (studentRole.rowCount) await client.query('insert into students(user_id,roll_number,section,department_id) values($1,$2,$3,$4)', [req.params.id, rollNumber.trim(), section?.trim().toUpperCase() || '1', departmentId]);
      }
    }
    if (employeeCode?.trim()) {
      const departmentId = await resolveStudentDepartment(client, department);
      await ensureFacultyProfile(client, req.params.id);
      await client.query('update faculty set employee_code=$2,department_id=case when $4 then $3::uuid else department_id end where user_id=$1', [req.params.id, employeeCode.trim(), departmentId, department !== undefined]);
    }
    await client.query('commit');
    res.json({ message: 'Person updated.' });
  } catch (error) {
    await client.query('rollback');
    if (error.code === '23505') return res.status(409).json({ message: 'That email, roll number, or employee code is already in use.' });
    throw error;
  } finally {
    client.release();
  }
});

portalRouter.delete('/admin/people/:id', requireAuth, allowRoles('admin'), async (req, res) => {
  if (req.user.sub === req.params.id) return res.status(400).json({ message: 'You cannot delete your own administrator account.' });
  const { rowCount } = await pool.query('delete from users where id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'User account was not found.' });
  res.status(204).end();
});
portalRouter.get('/notices', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`select id,title,description,category,published_at,expires_at,attachment_url from notices n
    where (n.expires_at is null or n.expires_at > now()) and ${noticeScope('n')} order by n.published_at desc`,[req.user.sub,req.user.activeRole]);
  res.json({ notices: rows });
});
portalRouter.get('/events', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`select id,title,description,category,starts_at,ends_at,location,capacity from events where starts_at > now() order by starts_at`);
    res.json({ events: rows });
  } catch (error) {
    next(error);
  }
});
portalRouter.post('/notices', requireAuth, allowRoles('admin','faculty','academic_coordinator','student_coordinator'), async (req, res) => {
  let { title, description, category = 'general', expiresAt = null, departmentId = null, sectionId = null } = req.body;
  if (!title?.trim() || !description?.trim()) return res.status(400).json({ message: 'A title and description are required.' });
  if ((departmentId && !sectionId) || (!departmentId && sectionId)) return res.status(400).json({message:'Choose both a department and section.'});
  if (req.user.activeRole==='student_coordinator') {
    const {rows}=await pool.query('select x.department_id,x.id academic_section_id from student_coordinator_sections r join academic_sections x on x.id=r.academic_section_id where r.user_id=$1 and ($2::uuid is null or x.id=$2)',[req.user.sub,sectionId]);
    if(rows.length!==1)return res.status(403).json({message:'Select one of your assigned classes.'});
    const own=rows[0];
    if(!own?.academic_section_id || (sectionId && sectionId!==own.academic_section_id) || (departmentId && departmentId!==own.department_id)) return res.status(403).json({message:'You can announce only to your assigned class.'});
    departmentId=own.department_id;sectionId=own.academic_section_id;
  }
  if (req.user.activeRole==='faculty') {
    if (!departmentId || !sectionId) return res.status(400).json({message:'Choose the department and section for this faculty announcement.'});
    const allowed=await pool.query(`select 1 from timetable t join faculty f on f.id=t.faculty_id join academic_sections x on x.id=t.academic_section_id
      where f.user_id=$1 and x.id=$2 and x.department_id=$3 and t.status='published' limit 1`,[req.user.sub,sectionId,departmentId]);
    if(!allowed.rowCount)return res.status(403).json({message:'You can announce only to sections assigned to you.'});
  }
  if(req.user.activeRole==='academic_coordinator'){
    const {academicAccess,requireDepartment,requireSections}=await import('../services/academicAccess.js');
    if(!departmentId){if(!(await academicAccess(req)).institutionWide)return res.status(403).json({message:'Select a class in your assigned department.'});}
    else {await requireDepartment(req,departmentId);await requireSections(req,[sectionId]);}
  }
  if(sectionId){const valid=await pool.query('select 1 from academic_sections where id=$1 and department_id=$2',[sectionId,departmentId]);if(!valid.rowCount)return res.status(400).json({message:'The section does not belong to this department.'});}
  const { rows } = await pool.query(`insert into notices(title,description,category,expires_at,author_id,target_department_id,target_academic_section_id)
    values($1,$2,$3,$4,$5,$6,$7) returning id,title,description,category,published_at,expires_at`, [title.trim(), description.trim(), category, expiresAt, req.user.sub, departmentId, sectionId]);
  res.status(201).json({ notice: rows[0] });
});
portalRouter.post('/events/:id/register', requireAuth, allowRoles('student'), async (req, res) => {
  const s = await pool.query('select id from students where user_id=$1', [req.user.sub]);
  if (!s.rows[0]) return res.status(404).json({ message: 'Student profile not found' });
  await pool.query('insert into event_registrations(event_id,student_id) values($1,$2) on conflict do nothing', [req.params.id, s.rows[0].id]);
  res.status(201).json({ message: 'Event registration confirmed' });
});
