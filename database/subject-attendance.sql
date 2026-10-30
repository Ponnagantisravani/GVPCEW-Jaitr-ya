-- Additive subject/period attendance. Existing attendance and credentials are untouched.
create table if not exists subject_attendance_subjects (
 subject_id uuid primary key references subjects(id), dept text not null, year integer not null, semester integer not null,
 kind text not null check(kind in ('theory','lab')), faculty_email text not null, display_name text not null,
 default_for_coordinator boolean not null default false
);
alter table subject_attendance_subjects add column if not exists default_for_coordinator boolean not null default false;
create table if not exists subject_attendance_batches (
 id uuid primary key default gen_random_uuid(), section_id uuid not null references academic_sections(id), name text not null, unique(section_id,name)
);
create table if not exists subject_attendance_batch_members (
 batch_id uuid not null references subject_attendance_batches(id), student_id uuid not null references students(id), primary key(batch_id,student_id)
);
create table if not exists subject_attendance_sessions (
 id uuid primary key default gen_random_uuid(), source_session_id uuid not null unique, source_kind text not null check(source_kind in ('demo','official')),
 coordinator_user_id uuid not null references users(id), subject_id uuid not null references subject_attendance_subjects(subject_id),
 section_id uuid not null references academic_sections(id), batch_id uuid references subject_attendance_batches(id), faculty_email text not null,
 attendance_date date not null default (clock_timestamp() at time zone 'Asia/Kolkata')::date,
 started_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null, closed_at timestamptz
);
create table if not exists subject_attendance_periods (
 session_id uuid not null references subject_attendance_sessions(id), period integer not null check(period between 1 and 20), primary key(session_id,period)
);
create table if not exists subject_attendance_roster (
 session_id uuid not null references subject_attendance_sessions(id), student_id uuid not null references students(id), primary key(session_id,student_id)
);
-- Claim actual students as well as class/batch keys. This prevents a whole-class
-- session overlapping any batch, and prevents incorrectly overlapping batches.
create table if not exists subject_attendance_claims (
 session_id uuid not null, student_id uuid not null, section_id uuid not null, attendance_date date not null, period integer not null,
 primary key(student_id,attendance_date,period),
 foreign key(session_id,student_id) references subject_attendance_roster(session_id,student_id),
 foreign key(session_id,period) references subject_attendance_periods(session_id,period)
);
create table if not exists subject_attendance_block_claims (
 session_id uuid not null references subject_attendance_sessions(id),section_id uuid not null,attendance_date date not null,batch_key text not null,period integer not null,
 primary key(section_id,attendance_date,batch_key,period),foreign key(session_id,period) references subject_attendance_periods(session_id,period)
);
create table if not exists subject_attendance_marks (
 session_id uuid not null,student_id uuid not null,marked_at timestamptz not null default clock_timestamp(),primary key(session_id,student_id),
 foreign key(session_id,student_id) references subject_attendance_roster(session_id,student_id)
);
create table if not exists subject_attendance_records (
 session_id uuid not null,student_id uuid not null,period integer not null,status text not null check(status in ('Pending','Present','Absent')),
 primary key(session_id,student_id,period),foreign key(session_id,student_id) references subject_attendance_roster(session_id,student_id),
 foreign key(session_id,period) references subject_attendance_periods(session_id,period)
);
create index if not exists subject_attendance_owner on subject_attendance_sessions(faculty_email,subject_id,attendance_date);
create index if not exists subject_attendance_student on subject_attendance_records(student_id);
-- Exact requested offerings. Canonical existing subjects are reused by code.
insert into subjects(department_id,code,name)
select d.id,v.code,v.name from departments d cross join (values
 ('CSE506','Computer Networks'),('CSE510-L','Computer Networks Lab'),
 ('CSE502','Data Mining and Data Warehousing'),('CSE511-L','Data Mining Lab'),
 ('CSE507','Artificial Intelligence'),('CSE516-L','DevOps Lab'),
 ('CSE501','Compiler Design'),('CSE509','Design Thinking and Innovation')) v(code,name)
where d.name in ('CSE','Computer Science Engineering','Computer Science and Engineering')
on conflict(code) do nothing;
insert into subject_attendance_subjects(subject_id,dept,year,semester,kind,faculty_email,display_name)
select s.id,'CSE',3,5,v.kind,v.email,v.name from subjects s join (values
 ('CSE506','theory','indu@gvpcew.ac.in','Computer Networks'),
 ('CSE510-L','lab','indu@gvpcew.ac.in','Computer Networks Lab'),
 ('CSE502','theory','sowmya@gvpcew.ac.in','Data Mining and Data Warehousing'),
 ('CSE511-L','lab','sowmya@gvpcew.ac.in','Data Mining Lab'),
 ('CSE507','theory','aswini@gvpcew.ac.in','Artificial Intelligence'),
 ('CSE516-L','lab','lakshmi@gvpcew.ac.in','DevOps Lab'),
 ('CSE501','theory','shankar@gvpcew.ac.in','Compiler Design'),
 ('CSE509','theory','gayatri@gvpcew.ac.in','Design Thinking and Innovation')) v(code,kind,email,name) on s.code=v.code
on conflict(subject_id) do update set kind=excluded.kind,faculty_email=excluded.faculty_email,display_name=excluded.display_name;
insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number)
select x.id,s.subject_id,s.kind,5 from academic_sections x join departments d on d.id=x.department_id
cross join subject_attendance_subjects s where x.year_number=3 and x.semester_number=5 and d.name in ('CSE','Computer Science Engineering','Computer Science and Engineering')
on conflict(academic_section_id,subject_id) do nothing;

-- Give CSE coordinators five fixed theory-subject choices and five manually
-- selected periods. These mappings are deliberately independent of timetables.
update subject_attendance_subjects sa
set default_for_coordinator=true
from subjects s
where s.id=sa.subject_id and s.code in ('CSE506','CSE507','CSE501','CSE502','CSE509');

insert into section_subjects(academic_section_id,subject_id,subject_type,semester_number)
select x.id,sa.subject_id,'theory',x.semester_number
from academic_sections x
join departments d on d.id=x.department_id
cross join subject_attendance_subjects sa
join subjects s on s.id=sa.subject_id
where d.name in ('CSE','Computer Science Engineering','Computer Science and Engineering')
 and sa.default_for_coordinator and s.department_id=x.department_id
on conflict(academic_section_id,subject_id) do nothing;
