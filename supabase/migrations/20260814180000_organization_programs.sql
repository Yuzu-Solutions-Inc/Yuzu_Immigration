-- Org-scoped custom program templates (kits for future projects).
-- Editing a template does not rewrite forms/docs on projects already created.

create table public.organization_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  allows_individual boolean not null default true,
  allows_couple boolean not null default true,
  allows_family boolean not null default true,
  allows_inside_canada boolean not null default true,
  allows_outside_canada boolean not null default true,
  forms jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_programs_name_chk
    check (char_length(trim(name)) between 1 and 120),
  constraint organization_programs_composition_chk
    check (allows_individual or allows_couple or allows_family),
  constraint organization_programs_location_chk
    check (allows_inside_canada or allows_outside_canada),
  constraint organization_programs_forms_chk
    check (jsonb_typeof(forms) = 'array'),
  constraint organization_programs_documents_chk
    check (jsonb_typeof(documents) = 'array')
);

comment on table public.organization_programs is
  'Firm-defined program templates. Snapshot forms/docs onto projects at create time; later template edits do not mutate existing projects.';

comment on column public.organization_programs.forms is
  'Array of {formCode, isRequired, sortOrder}. Form person/project scope comes from the IRCC catalog.';

comment on column public.organization_programs.documents is
  'Array of {docKey, customLabel?, scope: person|project, isRequired, sortOrder}.';

create unique index organization_programs_org_name_uidx
  on public.organization_programs (organization_id, lower(trim(name)))
  where is_active;

create index organization_programs_org_idx
  on public.organization_programs (organization_id, sort_order, name);

alter table public.immigration_projects
  add column if not exists organization_program_id uuid
    references public.organization_programs(id) on delete set null;

comment on column public.immigration_projects.organization_program_id is
  'Optional org program template used at create time. Null for built-in kits / mixed custom files. Template edits do not change this project''s forms/docs.';

create index immigration_projects_org_program_idx
  on public.immigration_projects (organization_program_id)
  where organization_program_id is not null;

-- person | project scope for checklist rows (project-scoped still require a person_id for upload attribution).
alter table public.project_document_requests
  add column if not exists request_scope text not null default 'person';

alter table public.project_document_requests
  drop constraint if exists project_document_requests_scope_chk;

alter table public.project_document_requests
  add constraint project_document_requests_scope_chk
    check (request_scope in ('person', 'project'));

comment on column public.project_document_requests.request_scope is
  'person = one request per participant; project = one request for the file (person_id is the principal for upload attribution).';

alter table public.organization_programs enable row level security;

create policy organization_programs_select
  on public.organization_programs for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_programs_insert
  on public.organization_programs for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy organization_programs_update
  on public.organization_programs for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy organization_programs_delete
  on public.organization_programs for delete to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, update, delete on public.organization_programs
  to authenticated;
grant select, insert, update, delete on public.organization_programs
  to service_role;
