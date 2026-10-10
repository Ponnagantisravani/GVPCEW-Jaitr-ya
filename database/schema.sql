create extension if not exists pgcrypto;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'faculty', 'student')),
  created_at timestamptz not null default now()
);

-- A single person may work in more than one portal. `users.role` remains as a
-- legacy/default role for existing data; authorization uses this mapping.
create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin','faculty','academic_coordinator','student','student_coordinator')),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references users(id) on delete set null,
  primary key (user_id, role)
);


create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  department_id uuid references departments(id),
  roll_number text not null unique,
  section text not null default 'A',
  admission_number text unique,
  created_at timestamptz not null default now()
);

alter table students add column if not exists face_enrollment_status text not null default 'pending'
  check (face_enrollment_status in ('pending', 'completed'));
alter table students add column if not exists face_enrolled_at timestamptz;

create table if not exists faculty (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  department_id uuid references departments(id),
  employee_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists classrooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  building_name text not null,
  room_name text not null,
  active boolean not null default true
);

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id),
  code text not null unique,
  name text not null,
  faculty_id uuid references faculty(id)
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id),
  name text not null,
  code text not null unique,
  duration_years integer not null default 4 check (duration_years > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists semesters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  semester_number integer not null check (semester_number between 1 and 8),
  academic_year text not null,
  unique(course_id, semester_number, academic_year)
);

-- A section is the authoritative class group used to distribute a published
-- timetable to its students (for example: CSE, year 3, semester 5, CSE-3).
create table if not exists academic_sections (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  year_number integer not null check (year_number between 1 and 4),
  semester_number integer not null check (semester_number between 1 and 8),
  section_name text not null,
  academic_year text not null,
  unique(department_id, year_number, semester_number, section_name, academic_year)
);

alter table students add column if not exists academic_section_id uuid references academic_sections(id);

-- The authoritative faculty teaching assignment for one subject in one class section.
create table if not exists faculty_section_assignments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references faculty(id) on delete restrict,
  department_id uuid not null references departments(id) on delete restrict,
  year_number integer not null check (year_number between 1 and 4),
  semester_number integer not null check (semester_number between 1 and 8),
  academic_section_id uuid not null references academic_sections(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete restrict,
  academic_year text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(academic_section_id, subject_id)
);
create index if not exists idx_faculty_section_assignments_faculty on faculty_section_assignments(faculty_id, status);
create index if not exists idx_faculty_section_assignments_section on faculty_section_assignments(academic_section_id, status);

-- Subjects explicitly offered to one class section; department catalog subjects are not automatically offered everywhere.
create table if not exists section_subjects (
  id uuid primary key default gen_random_uuid(),
  academic_section_id uuid not null references academic_sections(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete restrict,
  subject_type text not null default 'theory' check (subject_type in ('theory','lab','elective','project','other')),
  credits numeric(4,2),
  semester_number integer not null check (semester_number between 1 and 8),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(academic_section_id,subject_id)
);
create index if not exists idx_section_subjects_section on section_subjects(academic_section_id);

create table if not exists timetable (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  classroom_id uuid not null references classrooms(id),
  faculty_id uuid not null references faculty(id),
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  academic_year text not null,
  academic_section_id uuid references academic_sections(id),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  published_by uuid references users(id),
  updated_at timestamptz not null default now(),
  entry_type text not null default 'class' check (entry_type in ('class','lab','break','library','counselling','other'))
);

create index if not exists idx_timetable_section_published on timetable(academic_section_id, status, day_of_week, start_time);
create index if not exists idx_timetable_faculty_published on timetable(faculty_id, status, day_of_week, start_time);

create table if not exists face_embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references students(id) on delete cascade,
  embedding jsonb not null,
  model_version text not null default 'face_recognition_v1',
  created_at timestamptz not null default now()
);

create table if not exists dataset_images (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  roll_number text not null,
  original_name text not null,
  storage_key text not null unique,
  checksum text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png')),
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now()
);

create table if not exists enrollment_audit_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  operation text not null check (operation in ('lookup','upload')),
  source_ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_enrollment_audit_student_created on enrollment_audit_log(student_id, created_at desc);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  faculty_id uuid not null references faculty(id),
  classroom_id uuid not null references classrooms(id),
  status text not null check (status in ('present', 'absent', 'late')),
  attendance_date date not null default current_date,
  marked_at timestamptz not null default now(),
  unique (student_id, subject_id, attendance_date)
);

create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references attendance(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  coordinator_user_id uuid not null references users(id),
  subject_id uuid not null references subjects(id),
  section text not null,
  session_code text not null unique,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  examination_type text not null check (examination_type in ('assignment','internal','mid_1','mid_2','semester')),
  score numeric(6,2) not null check (score >= 0),
  maximum_score numeric(6,2) not null check (maximum_score > 0),
  created_by uuid references faculty(id),
  assignment_scores jsonb,
  updated_at timestamptz not null default now(),
  unique(student_id, subject_id, examination_type)
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  faculty_id uuid not null references faculty(id),
  academic_section_id uuid references academic_sections(id) on delete cascade,
  title text not null,
  description text,
  deadline timestamptz not null,
  attachment_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_assignments_section on assignments(academic_section_id, subject_id);

create table if not exists assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  submission_url text not null,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','late','reviewed')),
  unique(assignment_id, student_id)
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_note text,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists examinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('internal','mid','semester')),
  academic_year text not null,
  created_at timestamptz not null default now()
);

create table if not exists exam_schedules (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references examinations(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  classroom_id uuid references classrooms(id),
  exam_date date not null,
  start_time time not null,
  end_time time not null
);

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null default 'general',
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  attachment_url text,
  author_id uuid references users(id)
);

alter table notices add column if not exists target_department_id uuid references departments(id) on delete set null;
alter table notices add column if not exists target_academic_section_id uuid references academic_sections(id) on delete set null;
create index if not exists idx_notices_target_section on notices(target_academic_section_id, published_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now()
);

create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique(event_id, student_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'info',
  link text,
  read_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  ip_address inet,
  user_agent text,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  entity_name text not null,
  entity_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_student on attendance(student_id);
create index if not exists idx_attendance_subject on attendance(subject_id);
create index if not exists idx_attendance_marked_at on attendance(marked_at);
create index if not exists idx_dataset_images_roll_number on dataset_images(roll_number);
create index if not exists idx_marks_student on marks(student_id);
create index if not exists idx_assignments_deadline on assignments(deadline);
create index if not exists idx_leave_requests_student on leave_requests(student_id, created_at desc);
create index if not exists idx_leave_requests_status on leave_requests(status, created_at desc);
create index if not exists idx_notifications_user_unread on notifications(user_id) where read_at is null;
