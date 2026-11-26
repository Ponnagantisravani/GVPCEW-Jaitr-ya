-- HOD syllabus structure and faculty preference allocation, additive migration.
do $$ begin
  if exists(select 1 from pg_constraint where conname='user_roles_role_check') then
    alter table user_roles drop constraint user_roles_role_check;
  end if;
  alter table user_roles add constraint user_roles_role_check check(role in ('admin','faculty','academic_coordinator','hod','student','student_coordinator'));
end $$;
do $$ begin
  if exists(select 1 from pg_constraint where conname='users_role_check') then
    alter table users drop constraint users_role_check;
  end if;
  alter table users add constraint users_role_check check(role in ('admin','faculty','academic_coordinator','hod','student','student_coordinator'));
end $$;
create table if not exists hod_departments (
 user_id uuid not null references users(id) on delete cascade,
 department_id uuid not null references departments(id) on delete cascade,
 assigned_by uuid references users(id) on delete set null,
 assigned_at timestamptz not null default now(),
 primary key(user_id,department_id)
);
alter table faculty add column if not exists designation text not null default 'Faculty';
create index if not exists hod_departments_department on hod_departments(department_id,user_id);
create table if not exists syllabus_structures (
 id uuid primary key default gen_random_uuid(),
 department_id uuid not null references departments(id) on delete restrict,
 program text not null,
 regulation text not null,
 document_id uuid references syllabi(id) on delete set null,
 uploaded_by uuid references users(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','confirmed')),
 created_at timestamptz not null default now(),
 confirmed_at timestamptz
);
create table if not exists semester_subjects (
 id uuid primary key default gen_random_uuid(),
 structure_id uuid not null references syllabus_structures(id) on delete cascade,
 year integer not null check(year between 1 and 4),
 semester integer not null check(semester between 1 and 8),
 subject_code text not null,
 subject_name text not null,
 type text not null default 'theory' check(type in ('theory','lab','elective','honours')),
 credits numeric(5,2) not null default 0 check(credits>=0),
 periods_per_week numeric(5,2) not null default 0 check(periods_per_week>=0),
 sections_count integer not null default 1 check(sections_count between 1 and 100),
 syllabus_document_id uuid references syllabi(id) on delete set null,
 subject_id uuid references subjects(id) on delete set null,
 unique(structure_id,year,semester,subject_code)
);
-- CREATE TABLE IF NOT EXISTS does not change an existing deployment's table.
-- Add this field separately so older databases can store the reviewed section count.
alter table semester_subjects add column if not exists sections_count integer not null default 1 check(sections_count between 1 and 100);
create index if not exists semester_subjects_structure_semester on semester_subjects(structure_id,year,semester);
create table if not exists preference_sheets (
 id uuid primary key default gen_random_uuid(),
 structure_id uuid not null references syllabus_structures(id) on delete restrict,
 year integer not null check(year between 1 and 4),
 semester integer not null check(semester between 1 and 8),
 status text not null default 'draft' check(status in ('draft','published','closed')),
 deadline timestamptz not null,
 created_by uuid references users(id) on delete set null,
 published_at timestamptz,
 closed_at timestamptz,
 unique(structure_id,year,semester)
);
alter table preference_sheets add column if not exists created_at timestamptz not null default now();
alter table preference_sheets add column if not exists assignments_confirmed_at timestamptz;
create table if not exists preference_sheet_subjects (
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 semester_subject_id uuid not null references semester_subjects(id) on delete restrict,
 primary key(sheet_id,semester_subject_id)
);
create table if not exists faculty_preferences (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 faculty_id uuid not null references faculty(id) on delete cascade,
 semester_subject_id uuid not null references semester_subjects(id) on delete restrict,
 rank integer not null check(rank between 1 and 4),
 submitted_at timestamptz not null default now(),
 unique(sheet_id,faculty_id,rank),
 unique(sheet_id,faculty_id,semester_subject_id)
);
alter table faculty_preferences add column if not exists remarks text not null default '';
alter table faculty_preferences alter column submitted_at drop not null;
alter table faculty_preferences alter column submitted_at drop default;
create table if not exists preference_sheet_recipients (
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 faculty_id uuid not null references faculty(id) on delete cascade,
 notified_at timestamptz,
 reminded_at timestamptz,
 submitted_at timestamptz,
 primary key(sheet_id,faculty_id)
);
create index if not exists preference_sheet_recipients_faculty on preference_sheet_recipients(faculty_id,sheet_id);
create table if not exists preference_submissions (
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 faculty_id uuid not null references faculty(id) on delete cascade,
 remarks text not null default '',
 submitted_at timestamptz,
 primary key(sheet_id,faculty_id)
);
create table if not exists subject_assignments (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 semester_subject_id uuid not null references semester_subjects(id) on delete restrict,
 section uuid not null references academic_sections(id) on delete cascade,
 faculty_id uuid not null references faculty(id) on delete restrict,
 assigned_by uuid references users(id) on delete set null,
 confirmed_at timestamptz,
 unique(sheet_id,semester_subject_id,section)
);
create table if not exists hod_notification_events (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 event_key text not null,
 recipient_user_id uuid not null references users(id) on delete cascade,
 notification_id uuid references notifications(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(sheet_id,event_key,recipient_user_id)
);
create index if not exists hod_notification_due on preference_sheets(deadline) where status='published';
create index if not exists faculty_preferences_sheet on faculty_preferences(sheet_id,semester_subject_id,rank);
create index if not exists subject_assignments_faculty on subject_assignments(faculty_id,confirmed_at);
create table if not exists assignment_history (
 id uuid primary key default gen_random_uuid(),
 sheet_id uuid not null references preference_sheets(id) on delete cascade,
 semester_subject_id uuid not null references semester_subjects(id) on delete restrict,
 section uuid not null references academic_sections(id) on delete cascade,
 previous_faculty_id uuid references faculty(id) on delete set null,
 new_faculty_id uuid references faculty(id) on delete restrict,
 changed_by uuid references users(id) on delete set null,
 changed_at timestamptz not null default now()
);
create index if not exists assignment_history_section on assignment_history(sheet_id,semester_subject_id,section,changed_at desc);

create table if not exists hod_assignment_submissions (
 id uuid primary key default gen_random_uuid(),
 structure_id uuid not null references syllabus_structures(id) on delete restrict,
 department_id uuid not null references departments(id) on delete restrict,
 version integer not null check(version>0),
 snapshot jsonb not null,
 note text not null default '',
 submitted_by uuid references users(id) on delete set null,
 submitted_at timestamptz not null default now(),
 unique(structure_id,version)
);
create index if not exists hod_assignment_submissions_department on hod_assignment_submissions(department_id,submitted_at desc);
