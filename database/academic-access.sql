alter table users add column if not exists active boolean not null default true;
create table if not exists academic_coordinator_departments (
 user_id uuid not null references users(id) on delete cascade,
 department_id uuid not null references departments(id) on delete cascade,
 assigned_by uuid references users(id), assigned_at timestamptz not null default now(),
 primary key(user_id,department_id)
);
create table if not exists student_coordinator_sections (
 user_id uuid not null references users(id) on delete cascade,
 academic_section_id uuid not null references academic_sections(id) on delete cascade,
 assigned_by uuid references users(id), assigned_at timestamptz not null default now(),
 primary key(user_id,academic_section_id)
);
create table if not exists academic_institution_access (
 user_id uuid primary key references users(id) on delete cascade,
 assigned_by uuid references users(id), assigned_at timestamptz not null default now()
);
create table if not exists revoked_auth_tokens (
 token_hash text primary key, user_id uuid not null references users(id) on delete cascade,
 expires_at timestamptz not null, revoked_at timestamptz not null default now()
);
create index if not exists revoked_auth_tokens_expiry on revoked_auth_tokens(expires_at);
create table if not exists access_migrations (name text primary key, applied_at timestamptz not null default now());
-- Preserve the previously supported own-section coordinator responsibility once.
insert into student_coordinator_sections(user_id,academic_section_id)
 select s.user_id,s.academic_section_id from students s join user_roles r on r.user_id=s.user_id and r.role='student_coordinator'
 where s.academic_section_id is not null and not exists(select 1 from access_migrations where name='coordinator-own-section-v1')
 on conflict do nothing;
insert into access_migrations(name) values('coordinator-own-section-v1') on conflict do nothing;
-- Academic coordinators receive no automatic department or institution grant.
-- Later faculty migrations replace this compatibility view with a richer
-- relation. Preserve that relation when re-running production migrations.
do $$ begin
 if to_regclass('public.faculty_assignments') is null then
  execute 'create view faculty_assignments as select distinct faculty_id,subject_id,academic_section_id from timetable where status=''published''';
 end if;
end $$;
alter table syllabi add column if not exists academic_section_ids uuid[] not null default '{}';
alter table syllabi add column if not exists department_id uuid references departments(id);
update syllabi sy set department_id=d.id from departments d where sy.department_id is null and lower(trim(sy.department))=lower(trim(d.name));
alter table academic_documents add column if not exists academic_section_ids uuid[] not null default '{}';
alter table academic_documents add column if not exists institution_wide boolean not null default false;
