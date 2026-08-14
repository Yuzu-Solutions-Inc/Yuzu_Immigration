-- Internal consultation notes for an immigration file (firm-only).
-- Existing projects.notes stays as the optional free-text field on edit;
-- these rows are the chronological notes feed on the project page.

create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_notes_body_not_blank check (char_length(trim(body)) >= 1)
);

comment on table public.project_notes is
  'Internal consultant notes on an immigration file. Private to the firm. Deleting a note does not affect the project.';

create index project_notes_project_id_idx
  on public.project_notes (project_id);

create index project_notes_organization_id_idx
  on public.project_notes (organization_id);

create index project_notes_project_created_idx
  on public.project_notes (project_id, created_at desc);

alter table public.project_notes enable row level security;

create policy project_notes_select_access
  on public.project_notes for select to authenticated
  using (public.can_access_project(project_id));

create policy project_notes_insert_access
  on public.project_notes for insert to authenticated
  with check (
    public.can_access_project(project_id)
    and public.is_org_member(organization_id)
  );

create policy project_notes_update_access
  on public.project_notes for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_notes_delete_access
  on public.project_notes for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.project_notes to authenticated;
grant select, insert, update, delete on public.project_notes to service_role;
