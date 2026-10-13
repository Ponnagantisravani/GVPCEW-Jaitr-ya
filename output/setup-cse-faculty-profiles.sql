-- Existing accounts only. No passwords are created or reset.
-- APP-... employee codes are provisional internal identifiers, not college IDs.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('setup-requested-cse-faculty'));
CREATE TEMP TABLE requested_faculty(email text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO requested_faculty VALUES
 ('indu@gvpcew.ac.in'),('sowmya@gvpcew.ac.in'),('aswini@gvpcew.ac.in'),
 ('shankar@gvpcew.ac.in'),('gayatri@gvpcew.ac.in');
DO $$ DECLARE dept uuid; BEGIN
 IF (SELECT count(*) FROM departments WHERE lower(trim(name)) IN ('computer science engineering','computer science & engineering','computer science and engineering','cse'))<>1 THEN
  RAISE EXCEPTION 'A single CSE department is required. Review department setup first.';
 END IF;
 SELECT id INTO dept FROM departments WHERE lower(trim(name)) IN ('computer science engineering','computer science & engineering','computer science and engineering','cse');
 INSERT INTO faculty(user_id,department_id,employee_code)
 SELECT u.id,dept,'APP-'||u.id::text FROM requested_faculty r JOIN users u ON lower(u.email)=r.email
 WHERE u.active ON CONFLICT(user_id) DO NOTHING;
 INSERT INTO user_roles(user_id,role)
 SELECT u.id,'faculty' FROM requested_faculty r JOIN users u ON lower(u.email)=r.email
 WHERE u.active ON CONFLICT(user_id,role) DO NOTHING;
END $$;
SELECT r.email,f.employee_code,
 CASE WHEN u.id IS NULL THEN 'ACCOUNT_NOT_REGISTERED'
 WHEN NOT u.active THEN 'ACCOUNT_DISABLED'
 WHEN f.id IS NOT NULL AND ur.user_id IS NOT NULL THEN 'FACULTY_READY'
 ELSE 'NEEDS_REVIEW' END AS status
FROM requested_faculty r LEFT JOIN users u ON lower(u.email)=r.email
LEFT JOIN faculty f ON f.user_id=u.id
LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.role='faculty'
ORDER BY r.email;
COMMIT;
