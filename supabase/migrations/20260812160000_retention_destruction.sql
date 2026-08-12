-- Phase 3: retention schedule + destruction register (CICC 6-year closed-file hold)

alter table public.immigration_projects
  add column if not exists retain_until timestamptz,
  add column if not exists destroyed_at timestamptz,
  add column if not exists destroyed_by uuid references public.profiles (id) on delete set null,
  add column if not exists destruction_note text;

comment on column public.immigration_projects.retain_until is
  'Earliest eligible secure-destruction date (typically closed_at + 6 years).';
comment on column public.immigration_projects.destroyed_at is
  'When sensitive project content was securely destroyed.';

-- Backfill for already-closed projects
update public.immigration_projects
set retain_until = closed_at + interval '6 years'
where closed_at is not null
  and retain_until is null
  and destroyed_at is null;

create table if not exists public.file_destruction_register (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.immigration_projects (id) on delete set null,
  client_name text not null,
  service_summary text,
  file_closed_at timestamptz,
  destroyed_at timestamptz not null default now(),
  destroyed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists file_destruction_register_org_idx
  on public.file_destruction_register (organization_id, destroyed_at desc);

alter table public.file_destruction_register enable row level security;

drop policy if exists file_destruction_register_select_admin on public.file_destruction_register;
create policy file_destruction_register_select_admin
  on public.file_destruction_register
  for select
  to authenticated
  using (public.is_org_role(organization_id, array['owner', 'admin']));

-- Inserts only via service_role (server destruction path)
revoke all on table public.file_destruction_register from anon;
revoke insert, update, delete on table public.file_destruction_register from authenticated;
grant select on table public.file_destruction_register to authenticated;
grant all on table public.file_destruction_register to service_role;
