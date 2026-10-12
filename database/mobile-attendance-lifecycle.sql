-- Stage 6; run after mobile-attendance, mobile-attendance-fcm and mobile-attendance-ble.
alter table attendance_sessions add column if not exists start_source text not null default 'coordinator' check(start_source in ('coordinator','timetable'));
create unique index if not exists mobile_one_period_day on attendance_sessions(academic_section_id,period,((starts_at at time zone 'Asia/Kolkata')::date)) where mobile_mode;
create index if not exists mobile_expiring_sessions on attendance_sessions(expires_at) where mobile_mode and status='open';
create index if not exists mobile_roster_by_student on session_roster(student_id,session_id);
