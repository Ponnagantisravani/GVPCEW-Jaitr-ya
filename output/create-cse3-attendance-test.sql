-- Run in Neon immediately before testing. Uses India's current date/time.
-- Publishes a separate test subject for up to 30 minutes, ending before midnight.
-- The start is five minutes earlier, clamped to the beginning of today.
-- Does not enroll faces or bypass Firebase/Play Integrity checks.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('cse3-attendance-test'));
DO $$
DECLARE sec academic_sections%ROWTYPE; teacher faculty%ROWTYPE;
 sub_id uuid; room_id uuid; today_time timestamp; coordinator_id uuid;
 payload jsonb; day_name text; teacher_name text;
 teacher_email text;
 test_start timestamp; test_end timestamp;
BEGIN
 today_time := clock_timestamp() AT TIME ZONE 'Asia/Kolkata';
 test_start := date_trunc('minute',greatest(today_time-interval '5 minutes',date_trunc('day',today_time)));
 test_end := date_trunc('minute',least(today_time+interval '30 minutes',date_trunc('day',today_time)+interval '1 day'-interval '1 second'));
 IF test_end-today_time<interval '1 minute' THEN
  RAISE EXCEPTION 'Less than one minute remains today. Run again just after midnight for a fresh 30-minute test.';
 END IF;
 IF (SELECT count(*) FROM academic_sections a JOIN departments d ON d.id=a.department_id
  WHERE a.year_number=3 AND a.semester_number=5 AND a.section_name='3' AND a.academic_year='2026-2027'
  AND lower(trim(d.name)) IN ('computer science engineering','computer science & engineering','computer science and engineering','cse'))<>1 THEN
  RAISE EXCEPTION 'A single III CSE section 3 is required. Run student section setup first.';
 END IF;
 SELECT a.* INTO sec FROM academic_sections a JOIN departments d ON d.id=a.department_id
  WHERE a.year_number=3 AND a.semester_number=5 AND a.section_name='3' AND a.academic_year='2026-2027'
  AND lower(trim(d.name)) IN ('computer science engineering','computer science & engineering','computer science and engineering','cse');
 SELECT u.id INTO coordinator_id FROM users u JOIN students s ON s.user_id=u.id
 WHERE lower(u.email)='324103210170.sravani@gvpcew.ac.in' AND u.active AND s.academic_section_id=sec.id
 AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='student_coordinator');
 IF coordinator_id IS NULL THEN RAISE EXCEPTION 'Sravani must have an active coordinator account assigned to section 3.'; END IF;
 SELECT f.* INTO teacher FROM faculty f JOIN users u ON u.id=f.user_id
 WHERE u.active AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='faculty')
 ORDER BY (lower(u.email)='indu@gvpcew.ac.in') DESC,u.email LIMIT 1;
 IF teacher.id IS NULL THEN RAISE EXCEPTION 'No active faculty profile exists. Faculty role alone is not a faculty profile.'; END IF;
 INSERT INTO student_coordinator_sections(user_id,academic_section_id)
 VALUES(coordinator_id,sec.id) ON CONFLICT DO NOTHING;
 INSERT INTO subjects(department_id,code,name,faculty_id)
 VALUES(sec.department_id,'CSE3-ATTENDANCE-TEST','TEST ONLY - III CSE 3 Attendance',teacher.id)
 ON CONFLICT(code) DO UPDATE SET faculty_id=excluded.faculty_id RETURNING id INTO sub_id;
 SELECT email INTO teacher_email FROM users WHERE id=teacher.user_id;
 INSERT INTO subject_attendance_subjects(subject_id,dept,year,semester,kind,faculty_email,display_name)
 VALUES(sub_id,'CSE',3,5,'theory',teacher_email,'TEST ONLY - III CSE 3 Attendance')
 ON CONFLICT(subject_id) DO UPDATE SET faculty_email=excluded.faculty_email,display_name=excluded.display_name;
 INSERT INTO section_subjects(academic_section_id,subject_id,subject_type,semester_number,created_by)
 VALUES(sec.id,sub_id,'theory',5,coordinator_id)
 ON CONFLICT(academic_section_id,subject_id) DO NOTHING;
 INSERT INTO classrooms(room_code,building_name,room_name)
 VALUES('CSE3-ATTENDANCE-TEST','Attendance testing','Test room')
 ON CONFLICT(room_code) DO UPDATE SET active=true RETURNING id INTO room_id;
 -- Only replace this test subject's timetable, never official class periods.
 UPDATE timetable SET status='draft',updated_at=now() WHERE subject_id=sub_id AND academic_section_id=sec.id;
 INSERT INTO timetable(subject_id,classroom_id,faculty_id,day_of_week,start_time,end_time,academic_year,academic_section_id,status,published_at,published_by,entry_type)
 VALUES(sub_id,room_id,teacher.id,extract(dow FROM today_time)::int,
 test_start::time,test_end::time,
 '2026-2027',sec.id,'published',now(),coordinator_id,'class');
 -- The timetable grid reads academic_documents, whereas APK attendance reads
 -- timetable rows. Keep both representations in sync for this test period.
 SELECT coalesce(published,draft) INTO payload FROM academic_documents
 WHERE kind='timetable' AND key='cse_sec3_year3';
 payload := coalesce(payload,jsonb_build_object('title','III CSE - Section 3','academicYear','2026-2027','yearNumber',3,'semesterNumber',5,'days',jsonb_build_array('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'),'periods','[]'::jsonb,'grid','{}'::jsonb));
 day_name := trim(to_char(today_time,'Day'));
 SELECT full_name INTO teacher_name FROM users WHERE id=teacher.user_id;
 payload := jsonb_set(payload,'{periods}',coalesce((SELECT jsonb_agg(p) FROM jsonb_array_elements(coalesce(payload->'periods','[]'::jsonb)) p WHERE p->>'id'<>'attendance_test'),'[]'::jsonb) || jsonb_build_array(jsonb_build_object('id','attendance_test','label','TEST Attendance','time',to_char(test_start,'HH24:MI')||' - '||to_char(test_end,'HH24:MI'))));
 payload := jsonb_set(payload,'{grid}',coalesce(payload->'grid','{}'::jsonb) || jsonb_build_object(day_name,coalesce(payload->'grid'->day_name,'{}'::jsonb) || jsonb_build_object('attendance_test',jsonb_build_object('subject','TEST ONLY - III CSE 3 Attendance','faculty',teacher_name,'type','class'))));
 payload := payload || jsonb_build_object('status','Published');
 INSERT INTO academic_documents(kind,key,draft,published,updated_by,published_at,academic_section_ids,updated_at)
 VALUES('timetable','cse_sec3_year3',payload,payload,coordinator_id,now(),ARRAY[sec.id],now())
 ON CONFLICT(kind,key) DO UPDATE SET draft=excluded.draft,published=excluded.published,updated_by=excluded.updated_by,published_at=excluded.published_at,academic_section_ids=excluded.academic_section_ids,updated_at=now();
END $$;
SELECT t.id AS timetable_id,su.name AS subject,a.section_name,t.start_time,t.end_time,
 u.email AS faculty_for_report,
 '324103210170.sravani@gvpcew.ac.in' AS coordinator
FROM timetable t JOIN subjects su ON su.id=t.subject_id JOIN academic_sections a ON a.id=t.academic_section_id
JOIN faculty f ON f.id=t.faculty_id JOIN users u ON u.id=f.user_id
WHERE su.code='CSE3-ATTENDANCE-TEST' AND t.status='published';
-- Shows the exact dropdown period number for today's test.
WITH today_slots AS (
 SELECT t.id,su.code,su.name,t.start_time,t.end_time,
 dense_rank() OVER(ORDER BY t.start_time,t.end_time)::int AS period
 FROM timetable t JOIN subjects su ON su.id=t.subject_id
 WHERE t.status='published' AND t.day_of_week=extract(dow FROM clock_timestamp() AT TIME ZONE 'Asia/Kolkata')
 AND t.academic_section_id IN(SELECT academic_section_id FROM timetable WHERE subject_id IN(SELECT id FROM subjects WHERE code='CSE3-ATTENDANCE-TEST') AND status='published')
)
SELECT name AS subject,period AS choose_this_period,start_time,end_time FROM today_slots WHERE code='CSE3-ATTENDANCE-TEST';
COMMIT;
