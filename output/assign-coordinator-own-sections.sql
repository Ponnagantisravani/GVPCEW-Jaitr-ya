-- Run after the student section and dashboard role scripts in Neon.
-- Grants the four named coordinators responsibility only for their own class.
BEGIN;
CREATE TEMP TABLE requested_coordinators(email text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO requested_coordinators VALUES
 ('324103210170.sravani@gvpcew.ac.in'),
 ('324103210134.sarvani@gvpcew.ac.in'),
 ('324103210168.lasya@gvpcew.ac.in'),
 ('325103210l17.saidurga@gvpcew.ac.in');
INSERT INTO student_coordinator_sections(user_id,academic_section_id)
SELECT u.id,s.academic_section_id FROM requested_coordinators r
JOIN users u ON lower(u.email)=r.email JOIN students s ON s.user_id=u.id
JOIN academic_sections a ON a.id=s.academic_section_id
JOIN departments d ON d.id=a.department_id
JOIN user_roles ur ON ur.user_id=u.id AND ur.role='student_coordinator'
WHERE u.active AND a.year_number=3 AND a.semester_number=5
 AND a.academic_year='2026-2027' AND a.section_name='3'
 AND lower(trim(d.name)) IN ('computer science engineering','computer science & engineering','computer science and engineering','cse')
ON CONFLICT(user_id,academic_section_id) DO NOTHING;
SELECT r.email,s.roll_number,a.section_name,
 CASE WHEN u.id IS NULL THEN 'ACCOUNT_NOT_REGISTERED'
 WHEN NOT u.active THEN 'ACCOUNT_DISABLED'
 WHEN ur.user_id IS NULL THEN 'COORDINATOR_ROLE_MISSING'
 WHEN s.academic_section_id IS NULL THEN 'STUDENT_SECTION_MISSING'
 WHEN cs.user_id IS NOT NULL THEN 'COORDINATOR_SECTION_ASSIGNED'
 ELSE 'SECTION_DOES_NOT_MATCH_III_CSE_3' END AS status
FROM requested_coordinators r LEFT JOIN users u ON lower(u.email)=r.email
LEFT JOIN students s ON s.user_id=u.id LEFT JOIN academic_sections a ON a.id=s.academic_section_id
LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.role='student_coordinator'
LEFT JOIN student_coordinator_sections cs ON cs.user_id=u.id AND cs.academic_section_id=s.academic_section_id
ORDER BY r.email;
COMMIT;
