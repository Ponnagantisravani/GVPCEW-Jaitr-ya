-- Stage 4: registered hardware support for selecting broadcaster helpers.
alter table mobile_fcm_devices add column if not exists can_advertise boolean not null default false;
