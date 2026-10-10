create table if not exists academic_documents (
 kind text not null check(kind in ('calendar','exams','timetable')),
 key text not null,
 draft jsonb not null,
 published jsonb,
 updated_by uuid references users(id) on delete set null,
 updated_at timestamptz not null default now(),
 published_at timestamptz,
 primary key(kind,key)
);
create index if not exists idx_notifications_user_created on notifications(user_id,created_at desc);
alter table notices add column if not exists target_department_id uuid references departments(id) on delete set null;
alter table notices add column if not exists target_academic_section_id uuid references academic_sections(id) on delete set null;
create index if not exists idx_notices_target_section on notices(target_academic_section_id, published_at desc);
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
create index if not exists idx_assignments_subject on assignments(subject_id);
create index if not exists idx_students_section on students(academic_section_id);
alter table students add column if not exists profile_details jsonb not null default '{}'::jsonb;
alter table attendance_sessions add column if not exists academic_section_id uuid references academic_sections(id);
alter table attendance_sessions add column if not exists classroom_id uuid references classrooms(id);
alter table attendance_sessions add column if not exists faculty_id uuid references faculty(id);
create table if not exists attendance_session_entries (
 session_id uuid not null references attendance_sessions(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 marked_at timestamptz not null default now(),
 primary key(session_id,student_id)
);
create table if not exists faculty_requests (
 id uuid primary key default gen_random_uuid(),
 faculty_id uuid not null references faculty(id) on delete cascade,
 kind text not null check(kind in ('correction','substitution')),
 details text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewer_note text,
 reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Older role assignments only populated user_roles. Backfill the faculty
-- records required by the faculty dashboard and future faculty role changes.
insert into faculty(user_id, employee_code, department_id)
select ur.user_id, 'AUTO-' || ur.user_id::text,
  (select s.department_id from students s where s.user_id=ur.user_id)
from user_roles ur
left join faculty f on f.user_id=ur.user_id
where ur.role='faculty' and f.id is null
on conflict (user_id) do nothing;
