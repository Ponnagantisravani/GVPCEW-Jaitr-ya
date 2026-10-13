-- Run in the Neon database connected to the Render backend.
-- Exact requested emails only. Preserves passwords, profiles and existing roles.
-- Missing and disabled accounts are reported, not created or reactivated.
BEGIN;
CREATE TEMP TABLE requested_dashboard_access(email text,role text,PRIMARY KEY(email,role)) ON COMMIT DROP;
INSERT INTO requested_dashboard_access VALUES
('324103210170.sravani@gvpcew.ac.in','student'),
('324103210170.sravani@gvpcew.ac.in','student_coordinator'),
('324103210170.sravani@gvpcew.ac.in','admin'),
('324103210170.sravani@gvpcew.ac.in','academic_coordinator'),
('324103210134.sarvani@gvpcew.ac.in','student'),
('324103210134.sarvani@gvpcew.ac.in','student_coordinator'),
('324103210134.sarvani@gvpcew.ac.in','admin'),
('324103210134.sarvani@gvpcew.ac.in','academic_coordinator'),
('324103210168.lasya@gvpcew.ac.in','student'),
('324103210168.lasya@gvpcew.ac.in','student_coordinator'),
('325103210l17.saidurga@gvpcew.ac.in','student'),
('325103210l17.saidurga@gvpcew.ac.in','student_coordinator'),
('indu@gvpcew.ac.in','faculty'),
('sowmya@gvpcew.ac.in','faculty'),
('aswini@gvpcew.ac.in','faculty'),
('shankar@gvpcew.ac.in','faculty'),
('gayatri@gvpcew.ac.in','faculty'),
('suneetha@gvpcew.ac.in','academic_coordinator');
-- Abort on case-insensitive duplicate emails instead of granting ambiguously.
DO $$ BEGIN
 IF EXISTS (SELECT lower(u.email) FROM users u JOIN
 (SELECT DISTINCT email FROM requested_dashboard_access) r ON lower(u.email)=r.email
 GROUP BY lower(u.email) HAVING count(*)>1) THEN
 RAISE EXCEPTION 'Duplicate case-insensitive emails found. No roles were changed.';
 END IF;
END $$;
INSERT INTO user_roles(user_id,role)
SELECT u.id,r.role FROM requested_dashboard_access r JOIN users u ON lower(u.email)=r.email
WHERE u.active ON CONFLICT(user_id,role) DO NOTHING;
SELECT r.email,r.role,
 CASE WHEN u.id IS NULL THEN 'NOT_REGISTERED'
 WHEN NOT u.active THEN 'DISABLED_ACCOUNT'
 WHEN ur.user_id IS NOT NULL THEN 'ACCESS_GRANTED'
 ELSE 'NEEDS_REVIEW' END AS access_status,
 CASE WHEN r.role IN ('student','student_coordinator') AND s.id IS NULL THEN 'Student profile missing'
 WHEN r.role='faculty' AND f.id IS NULL THEN 'Faculty profile and teaching assignments need setup'
 WHEN r.role='student_coordinator' THEN 'Verify coordinator section and timetable assignment'
 WHEN r.role='academic_coordinator' THEN 'Verify department responsibility assignment'
 ELSE NULL END AS setup_note
FROM requested_dashboard_access r LEFT JOIN users u ON lower(u.email)=r.email
LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.role=r.role
LEFT JOIN students s ON s.user_id=u.id LEFT JOIN faculty f ON f.user_id=u.id
ORDER BY r.email,r.role;
COMMIT;

