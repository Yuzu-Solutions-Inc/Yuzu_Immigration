-- Contract templates: optional intake form drives merge variables.
-- Project contracts: per-case editable copies with e-sign and case-file archive.

alter table public.contract_templates
  add column form_id uuid references public.booking_forms(id) on delete set null;

create index contract_templates_form_idx
  on public.contract_templates (form_id)
  where form_id is not null;

comment on column public.contract_templates.form_id is
  'Optional booking intake form whose field keys are available as {{merge}} variables.';

create type public.project_contract_status as enum (
  'draft',
  'pending_signature',
  'completed',
  'superseded'
);

create table public.project_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  template_id uuid references public.contract_templates(id) on delete set null,
  form_id uuid references public.booking_forms(id) on delete set null,
  title text not null,
  body_html text not null,
  translations jsonb not null default '{}'::jsonb,
  form_answers jsonb not null default '{}'::jsonb,
  require_consultant_signature boolean not null default true,
  status public.project_contract_status not null default 'draft',
  version integer not null default 1,
  superseded_by uuid references public.project_contracts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_contracts_title_chk
    check (char_length(trim(title)) between 1 and 120),
  constraint project_contracts_body_chk
    check (char_length(body_html) between 1 and 200000),
  constraint project_contracts_version_chk
    check (version >= 1)
);

comment on table public.project_contracts is
  'Project-specific contract copy (from template). Editable until sent; new version on material change after send.';

create index project_contracts_project_idx
  on public.project_contracts (project_id, version desc);

create index project_contracts_org_idx
  on public.project_contracts (organization_id);

create unique index project_contracts_open_uidx
  on public.project_contracts (project_id)
  where status in ('draft', 'pending_signature');

-- Envelopes may belong to a booking appointment or an immigration project.
alter table public.contract_envelopes
  alter column appointment_id drop not null;

alter table public.contract_envelopes
  add column project_id uuid references public.immigration_projects(id) on delete cascade,
  add column project_contract_id uuid references public.project_contracts(id) on delete set null;

alter table public.contract_envelopes
  add constraint contract_envelopes_context_chk
  check (
    (appointment_id is not null and project_id is null)
    or (appointment_id is null and project_id is not null)
  );

create index contract_envelopes_project_idx
  on public.contract_envelopes (project_id)
  where project_id is not null;

drop index if exists public.contract_envelopes_active_uidx;

create unique index contract_envelopes_active_appointment_uidx
  on public.contract_envelopes (appointment_id, template_id)
  where appointment_id is not null
    and status in ('sent', 'viewed', 'partially_signed');

create unique index contract_envelopes_active_project_uidx
  on public.contract_envelopes (project_id, project_contract_id)
  where project_id is not null
    and status in ('sent', 'viewed', 'partially_signed');

-- Signed contract PDFs archived on the case file.
create table public.project_contract_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  project_contract_id uuid not null references public.project_contracts(id) on delete cascade,
  envelope_id uuid not null references public.contract_envelopes(id) on delete restrict,
  principal_person_id uuid references public.people(id) on delete set null,
  title text not null,
  version integer not null,
  storage_path text not null,
  file_sha256 text not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint project_contract_files_hash_chk
    check (char_length(file_sha256) = 64),
  constraint project_contract_files_title_chk
    check (char_length(trim(title)) between 1 and 120)
);

comment on table public.project_contract_files is
  'Completed signed contract PDFs on the immigration case file. Kept for the life of the project (including after six-year personal-data destruction); removed only when the project is deleted.';

create index project_contract_files_project_idx
  on public.project_contract_files (project_id, created_at desc);

create unique index project_contract_files_envelope_uidx
  on public.project_contract_files (envelope_id);

alter table public.project_contracts enable row level security;
alter table public.project_contract_files enable row level security;

create policy project_contracts_select
  on public.project_contracts for select to authenticated
  using (public.is_org_member(organization_id));

create policy project_contracts_insert
  on public.project_contracts for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy project_contracts_update
  on public.project_contracts for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy project_contracts_delete
  on public.project_contracts for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy project_contract_files_select
  on public.project_contract_files for select to authenticated
  using (public.is_org_member(organization_id));

create policy project_contract_files_insert
  on public.project_contract_files for insert to authenticated
  with check (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.project_contracts to authenticated;
grant select, insert, update, delete on public.project_contracts to service_role;
grant select, insert on public.project_contract_files to authenticated;
grant select, insert, update, delete on public.project_contract_files to service_role;
