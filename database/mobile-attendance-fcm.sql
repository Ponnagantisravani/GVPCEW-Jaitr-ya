-- Stage 3. Run after mobile-attendance.sql; repeatable.
create table if not exists mobile_push_outbox (
 id bigint generated always as identity primary key,
 session_id uuid not null, student_id uuid not null,
 state text not null default 'pending' check(state in ('pending','sent','expired','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz, last_error text,
 unique(session_id,student_id),
 foreign key(session_id,student_id) references session_roster(session_id,student_id) on delete cascade
);
create index if not exists mobile_push_due on mobile_push_outbox(next_attempt_at) where state='pending';
