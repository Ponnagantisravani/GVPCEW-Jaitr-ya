ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT 'classroom' CHECK(room_type IN ('classroom','lab'));
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
UPDATE classrooms SET room_type='lab' WHERE room_code ~* '(lab|cslab)' AND room_type='classroom';
UPDATE classrooms SET is_test=true,active=false WHERE room_code ~* '(test|demo)';
INSERT INTO classrooms(room_code,building_name,room_name,active,room_type,is_test) VALUES
 ('104','Academic Block','Room 104',true,'classroom',false),('116','Academic Block','Room 116',true,'classroom',false)
ON CONFLICT(room_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS room_year_pools (
 year_number integer NOT NULL CHECK(year_number BETWEEN 1 AND 4),
 classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
 PRIMARY KEY(year_number,classroom_id),
 UNIQUE(classroom_id)
);
INSERT INTO room_year_pools(year_number,classroom_id)
SELECT CASE WHEN room_code IN ('101','102','104') THEN 2 WHEN room_code IN ('115','116','215','216') THEN 3 ELSE 4 END,id
FROM classrooms WHERE room_code IN ('101','102','104','115','116','215','216','201','202','203','214')
 AND room_type='classroom' AND active AND NOT is_test ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS room_pool_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 allow_borrow boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO room_pool_settings(id) VALUES(true) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS room_pool_classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_code text NOT NULL UNIQUE,
 year_number integer NOT NULL CHECK(year_number BETWEEN 2 AND 4),
 program text NOT NULL CHECK(program IN ('CSE','CSC','CSM')),
 department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
 academic_section_id uuid REFERENCES academic_sections(id) ON DELETE CASCADE,
 preferred_room_id uuid REFERENCES classrooms(id) ON DELETE SET NULL,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(academic_section_id)
);
INSERT INTO room_pool_classes(class_code,year_number,program,department_id,academic_section_id)
SELECT DISTINCT ON (x.year_number,x.section_name) x.year_number||'CSE'||regexp_replace(x.section_name,'\D','','g'),x.year_number,'CSE',x.department_id,x.id
FROM academic_sections x JOIN departments d ON d.id=x.department_id
WHERE x.year_number BETWEEN 2 AND 4 AND d.name ILIKE '%computer science%' AND d.name NOT ILIKE '%cyber%' AND d.name NOT ILIKE '%artificial%'
ORDER BY x.year_number,x.section_name,x.academic_year DESC ON CONFLICT(class_code) DO UPDATE SET academic_section_id=excluded.academic_section_id,department_id=excluded.department_id;
INSERT INTO room_pool_classes(class_code,year_number,program,department_id)
SELECT '2CSC',2,'CSC',id FROM departments WHERE name ILIKE '%computer science%' AND name NOT ILIKE '%cyber%' AND name NOT ILIKE '%artificial%' ORDER BY name LIMIT 1
ON CONFLICT(class_code) DO NOTHING;
INSERT INTO room_pool_classes(class_code,year_number,program,department_id)
SELECT '2CSM',2,'CSM',id FROM departments WHERE name ILIKE '%computer science%' AND name NOT ILIKE '%cyber%' AND name NOT ILIKE '%artificial%' ORDER BY name LIMIT 1
ON CONFLICT(class_code) DO NOTHING;
CREATE TABLE IF NOT EXISTS lab_venues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_name text NOT NULL UNIQUE,
 year_numbers integer[] NOT NULL DEFAULT ARRAY[2,3,4],
 active boolean NOT NULL DEFAULT true,
 CHECK(cardinality(year_numbers)>0)
);
CREATE TABLE IF NOT EXISTS lab_venue_rooms (
 venue_id uuid NOT NULL REFERENCES lab_venues(id) ON DELETE CASCADE,
 classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
 PRIMARY KEY(venue_id,classroom_id),
 UNIQUE(classroom_id)
);
INSERT INTO lab_venues(venue_name,year_numbers,active) VALUES
 ('CSLAB1 + CSLAB2',ARRAY[2,3,4],true),('CSLAB3 + CSLAB4',ARRAY[2,3,4],true),('Projects Lab',ARRAY[2,3,4],true),
 ('Year I Language Lab',ARRAY[1],true),('Year I C Lab',ARRAY[1],true),('Year I Physics Lab',ARRAY[1],true)
ON CONFLICT(venue_name) DO NOTHING;
INSERT INTO lab_venue_rooms(venue_id,classroom_id)
SELECT v.id,c.id FROM lab_venues v JOIN classrooms c ON
 (v.venue_name='CSLAB1 + CSLAB2' AND upper(c.room_code) ~ 'CSLAB1.*CSLAB2|CSLAB2.*CSLAB1') OR
 (v.venue_name='CSLAB3 + CSLAB4' AND upper(c.room_code) ~ 'CSLAB3.*CSLAB4|CSLAB4.*CSLAB3') OR
 (v.venue_name='Projects Lab' AND lower(c.room_code) ~ 'project.*lab')
ON CONFLICT DO NOTHING;
ALTER TABLE room_allotments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','out_of_date'));
ALTER TABLE room_allotments ADD COLUMN IF NOT EXISTS timetable_signature text;
ALTER TABLE room_allotments ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE room_allotments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE room_allotments ALTER COLUMN published_at DROP NOT NULL;
UPDATE room_allotments SET status='published' WHERE published_at IS NOT NULL;
UPDATE room_allotments SET status='out_of_date' WHERE timetable_signature IS NULL;
CREATE INDEX IF NOT EXISTS room_allotments_status_week ON room_allotments(published_by,status,week_start DESC);
