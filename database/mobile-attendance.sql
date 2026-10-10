-- Run after the existing production migrations. Additive and repeatable.
alter table students add column if not exists face_embedding double precision[];
alter table students add column if not exists embedding_model text not null default 'legacy-unknown';
alter table students add column if not exists face_enrolled boolean not null default false;
alter table students add column if not exists enrollment_status text not null default 'required' check(enrollment_status in ('required','pending','approved','rejected'));
alter table students add column if not exists bound_device_id text;
alter table students add column if not exists mobile_consent_at timestamptz;
alter table students add column if not exists mobile_password_changed_at timestamptz;
alter table students add column if not exists enrollment_preview bytea;
alter table students add column if not exists enrollment_preview_expires_at timestamptz;
-- Never relabel legacy templates as MobileFaceNet; preserve the old enrollment table.
update students s set embedding_model=coalesce(f.model_version,'legacy-unknown') from face_embeddings f where f.student_id=s.id and s.embedding_model='legacy-unknown';
create unique index if not exists mobile_one_device on students(bound_device_id) where bound_device_id is not null;
alter table attendance_sessions add column if not exists mobile_mode boolean not null default false;
alter table attendance_sessions add column if not exists period text;
alter table attendance_sessions add column if not exists status text not null default 'open' check(status in ('open','closed'));
alter table attendance_sessions add column if not exists late_expires_at timestamptz;
create unique index if not exists mobile_one_open_section on attendance_sessions(academic_section_id) where mobile_mode and status='open';
create table if not exists session_roster (
 session_id uuid references attendance_sessions(id) on delete cascade,
 student_id uuid references students(id) on delete cascade,
 primary key(session_id,student_id)
);
create table if not exists ble_tokens (
 session_id uuid references attendance_sessions(id) on delete cascade,
 slot integer not null check(slot between 0 and 7), token text not null unique,
 valid_from timestamptz not null, valid_to timestamptz not null,
 primary key(session_id,slot), check(valid_to>valid_from)
);
create table if not exists broadcasters (
 session_id uuid references attendance_sessions(id) on delete cascade,
 student_id uuid references students(id) on delete cascade,
 primary key(session_id,student_id), foreign key(session_id,student_id) references session_roster(session_id,student_id)
);
create table if not exists mobile_attendance_challenges (
 id uuid primary key default gen_random_uuid(), session_id uuid not null,
 student_id uuid not null, device_id text not null, challenge_type text not null check(challenge_type in ('blink','turn_left','turn_right','smile')),
 method text not null check(method in ('ble','fallback')), created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null, used_at timestamptz,
 foreign key(session_id,student_id) references session_roster(session_id,student_id) on delete cascade
);
create index if not exists mobile_challenges_attempts on mobile_attendance_challenges(session_id,student_id,created_at);
create table if not exists attendance_records (
 session_id uuid not null, student_id uuid not null,
 status text not null check(status in ('PRESENT','ABSENT','LATE')),
 method text check(method in ('ble','fallback')), similarity double precision,
 challenge_type text, device_id text, created_at timestamptz not null default clock_timestamp(),
 is_late boolean not null default false,
 primary key(session_id,student_id),
 foreign key(session_id,student_id) references session_roster(session_id,student_id) on delete cascade
);
create index if not exists mobile_attendance_history on attendance_records(student_id,created_at desc);
create table if not exists audit_log (
 id bigint generated always as identity primary key, event text not null,
 actor_id uuid references users(id) on delete set null, session_id uuid references attendance_sessions(id) on delete set null,
 details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create index if not exists mobile_audit_actor on audit_log(actor_id,created_at desc);
create table if not exists mobile_fcm_devices (
 user_id uuid primary key references users(id) on delete cascade,
 device_id text not null unique, fcm_token text not null unique, updated_at timestamptz not null default now()
);
