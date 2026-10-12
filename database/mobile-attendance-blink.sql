-- Run after mobile-attendance.sql on existing installations; additive and repeatable.
alter table students add column if not exists enrolled_at timestamptz;
-- Existing enrollment flags/templates are preserved. Only admin reset permits re-enrollment.
