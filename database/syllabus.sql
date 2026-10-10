create table if not exists syllabi (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  batch text not null,
  description text not null default '',
  file_name text not null,
  pdf bytea not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table syllabi alter column pdf drop not null;
alter table syllabi alter column file_name drop not null;
alter table syllabi add column if not exists structure jsonb;
-- NULL means a full-semester document for students. A subject link makes the
-- document available only to faculty who teach that subject in its target class.
alter table syllabi add column if not exists subject_id uuid references subjects(id) on delete set null;
create index if not exists idx_syllabi_subject on syllabi(subject_id) where subject_id is not null;

-- Structured, subject-wise source of truth. A course code is unique in subjects.
alter table syllabi add column if not exists faculty_id uuid references faculty(id) on delete set null;
alter table syllabi add column if not exists department_id uuid references departments(id) on delete set null;
alter table syllabi add column if not exists academic_section_ids uuid[] default '{}';
create index if not exists idx_syllabi_faculty on syllabi(faculty_id) where faculty_id is not null;
alter table subjects add column if not exists year_number integer check (year_number between 1 and 4);
alter table subjects add column if not exists semester_number integer check (semester_number between 1 and 8);
create table if not exists subject_syllabi (
  id uuid primary key default gen_random_uuid(), subject_id uuid not null unique references subjects(id) on delete cascade,
  course_outcomes text not null default '', unit_1 text not null default '', unit_2 text not null default '',
  unit_3 text not null default '', unit_4 text not null default '', unit_5 text not null default '',
  textbooks text not null default '', reference_books text not null default '', web_references text not null default '',
  source_file_name text, created_by uuid references users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

