alter table attendance_sessions add column if not exists verification_mode text not null default 'code';
create table if not exists attendance_face_challenges (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references attendance_sessions(id) on delete cascade,
 student_id uuid not null references students(id) on delete cascade,
 device_hash text not null,
 actions jsonb not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '90 seconds',
 status text not null default 'pending' check(status in ('pending','rejected','confirmed')),
 receipt_id uuid,
 evidence_digest text,
 verifier_version text,
 recorded_at timestamptz
);
create index if not exists attendance_face_challenges_student on attendance_face_challenges(session_id,student_id,created_at);
create unique index if not exists attendance_face_one_student on attendance_face_challenges(session_id,student_id) where status='confirmed';
create unique index if not exists attendance_face_one_device on attendance_face_challenges(session_id,device_hash) where status='confirmed';
