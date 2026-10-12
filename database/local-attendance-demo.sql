-- Browser demonstrations are stored separately from official attendance.
create table if not exists local_attendance_demo_sessions (
 id uuid primary key default gen_random_uuid(), section_id uuid not null references academic_sections(id),
 coordinator_user_id uuid not null references users(id), starts_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '60 seconds'),
 late_expires_at timestamptz not null default (clock_timestamp()+interval '180 seconds')
);
create table if not exists local_attendance_demo_roster (
 session_id uuid not null references local_attendance_demo_sessions(id) on delete cascade,
 student_id uuid not null references students(id), primary key(session_id,student_id)
);
create table if not exists local_attendance_demo_records (
 session_id uuid not null, student_id uuid not null, status text not null check(status in ('PRESENT','LATE')),
 recorded_at timestamptz not null default clock_timestamp(), primary key(session_id,student_id),
 foreign key(session_id,student_id) references local_attendance_demo_roster(session_id,student_id)
);
create index if not exists local_attendance_demo_section on local_attendance_demo_sessions(section_id,starts_at desc);

create table if not exists local_attendance_demo_faces (
 student_id uuid primary key references students(id), embedding double precision[] not null,
 model text not null check(model='opencv-sface-demo-v1'), version uuid not null default gen_random_uuid(), created_at timestamptz not null default clock_timestamp(), check(array_length(embedding,1)=128)
);
create table if not exists local_attendance_demo_challenges (
 id uuid primary key default gen_random_uuid(), session_id uuid not null, student_id uuid not null,
 reference_version uuid not null, expires_at timestamptz not null, used boolean not null default false,
 foreign key(session_id,student_id) references local_attendance_demo_roster(session_id,student_id)
);
