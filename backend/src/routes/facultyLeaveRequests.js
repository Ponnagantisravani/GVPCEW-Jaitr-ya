import { Router } from '../utils/router.js';
import { pool } from '../config/db.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';

export const facultyLeaveRequestsRouter = Router();
facultyLeaveRequestsRouter.use(requireAuth, allowRoles('faculty'));

const visibleToFaculty = userParameter => `(
  exists (
    select 1 from timetable t
    where t.faculty_id = (select id from faculty where user_id = ${userParameter})
      and t.academic_section_id = s.academic_section_id
      and t.status = 'published'
  )
)`;

facultyLeaveRequestsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    select lr.id, lr.start_date, lr.end_date, lr.reason, lr.status, lr.reviewer_note,
      lr.created_at, lr.reviewed_at, u.full_name student_name, u.email student_email,
      s.roll_number, s.section, d.name department
    from leave_requests lr
    join students s on s.id = lr.student_id
    join users u on u.id = s.user_id
    left join departments d on d.id = s.department_id
    where ${visibleToFaculty('$1')}
    order by case when lr.status = 'pending' then 0 else 1 end, lr.created_at desc`,
    [req.user.sub]
  );
  res.json({ requests: rows });
});

facultyLeaveRequestsRouter.patch('/:id', async (req, res) => {
  const { action, note = '' } = req.body;
  if (!['approved', 'rejected', 'message'].includes(action)) {
    return res.status(400).json({ message: 'Choose approved, rejected, or message.' });
  }
  if (action === 'message' && !note.trim()) {
    return res.status(400).json({ message: 'Enter a message for the student.' });
  }
  if (['approved', 'rejected'].includes(action) && action === 'rejected' && !note.trim()) {
    return res.status(400).json({ message: 'Enter a reason when rejecting a leave request.' });
  }

  const { rows } = await pool.query(`
    update leave_requests lr
    set status = case when $2 = 'message' then lr.status else $2 end,
        reviewer_note = nullif(trim($3), ''),
        reviewed_by = $4,
        reviewed_at = case when $2 = 'message' then null else now() end
    from students s
    where lr.id = $1 and lr.student_id = s.id and lr.status = 'pending'
      and ${visibleToFaculty('$5')}
    returning lr.id, lr.status, lr.reviewer_note, lr.student_id,
      (select user_id from students where id = lr.student_id) student_user_id`,
    [req.params.id, action, note, req.user.sub, req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ message: 'Pending leave request not found or unavailable to you.' });

  const request = rows[0];
  const title = action === 'message' ? 'Faculty requested leave details' : `Leave request ${action}`;
  const body = action === 'message'
    ? request.reviewer_note
    : `Your leave request has been ${action}.${request.reviewer_note ? ` Note: ${request.reviewer_note}` : ''}`;
  await pool.query(
    `insert into notifications(user_id, title, body, type, link) values($1, $2, $3, 'leave', '/student-dashboard')`,
    [request.student_user_id, title, body]
  );

  delete request.student_user_id;
  res.json({ request });
});
