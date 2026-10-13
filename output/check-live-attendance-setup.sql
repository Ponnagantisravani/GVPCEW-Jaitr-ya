-- Read-only checks. Run in the Neon database connected to Render.
-- Does not expose password hashes, tokens, device IDs, or biometric templates.
SELECT a.section_name,a.year_number,a.semester_number,a.academic_year,
 count(s.id) AS student_accounts,
 count(s.id) FILTER(WHERE u.active AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='student')) AS approved_student_accounts,
 count(s.id) FILTER(WHERE u.active AND s.face_enrolled AND s.enrollment_status='approved' AND s.embedding_model='mobilefacenet-v1' AND s.bound_device_id IS NOT NULL) AS native_enrolled_students,
 (SELECT count(*) FROM timetable t WHERE t.academic_section_id=a.id AND t.status='published' AND t.entry_type IN ('class','lab')) AS published_class_periods
FROM academic_sections a LEFT JOIN students s ON s.academic_section_id=a.id LEFT JOIN users u ON u.id=s.user_id
WHERE a.year_number=3 AND a.semester_number=5 AND a.academic_year='2026-2027'
GROUP BY a.id ORDER BY a.section_name;

SELECT u.email,s.roll_number,a.section_name AS student_section,
 EXISTS(SELECT 1 FROM student_coordinator_sections cs WHERE cs.user_id=u.id AND cs.academic_section_id=s.academic_section_id) AS own_section_responsibility,
 s.face_enrolled,s.enrollment_status,
 EXISTS(SELECT 1 FROM mobile_fcm_devices d WHERE d.user_id=u.id AND d.device_id=s.bound_device_id AND d.can_advertise) AS registered_broadcast_phone
FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='student_coordinator'
LEFT JOIN students s ON s.user_id=u.id LEFT JOIN academic_sections a ON a.id=s.academic_section_id
WHERE lower(u.email) IN ('324103210170.sravani@gvpcew.ac.in','324103210134.sarvani@gvpcew.ac.in','324103210168.lasya@gvpcew.ac.in','325103210l17.saidurga@gvpcew.ac.in')
ORDER BY u.email;

SELECT u.email,f.id IS NOT NULL AS faculty_profile_exists,
 (SELECT count(*) FROM timetable t WHERE t.faculty_id=f.id AND t.status='published') AS published_teaching_periods
FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='faculty'
LEFT JOIN faculty f ON f.user_id=u.id
WHERE lower(u.email) IN ('indu@gvpcew.ac.in','sowmya@gvpcew.ac.in','aswini@gvpcew.ac.in','shankar@gvpcew.ac.in','gayatri@gvpcew.ac.in')
ORDER BY u.email;

SELECT u.email,(SELECT count(*) FROM academic_coordinator_departments d WHERE d.user_id=u.id) AS assigned_departments,
 EXISTS(SELECT 1 FROM academic_institution_access i WHERE i.user_id=u.id) AS institution_access
FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='academic_coordinator'
WHERE lower(u.email) IN ('suneetha@gvpcew.ac.in','324103210170.sravani@gvpcew.ac.in','324103210134.sarvani@gvpcew.ac.in')
ORDER BY u.email;
