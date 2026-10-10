alter table notifications add column if not exists scheduled_for timestamptz;
create index if not exists notifications_user_scheduled on notifications(user_id,scheduled_for);
