-- Searchable lookup hashes, write-time project progress, targeted indexes,
-- merged profiles SELECT policy, and tighter helper RPC grants.

create extension if not exists pg_trgm with schema extensions;

alter table public.people
  add column if not exists email_lookup_hash text,
  add column if not exists search_name text;

create index if not exists people_org_email_lookup_hash_idx
  on public.people (organization_id, email_lookup_hash)
  where email_lookup_hash is not null;

create index if not exists people_org_search_name_trgm_idx
  on public.people using gin (search_name extensions.gin_trgm_ops);

create index if not exists people_org_status_expires_idx
  on public.people (organization_id, status_expires_at)
  where status_expires_at is not null;

alter table public.immigration_projects
  add column if not exists search_title text,
  add column if not exists docs_done integer not null default 0,
  add column if not exists docs_total integer not null default 0,
  add column if not exists docs_to_review integer not null default 0,
  add column if not exists form_percent integer not null default 0;

create index if not exists immigration_projects_org_search_title_trgm_idx
  on public.immigration_projects using gin (search_title extensions.gin_trgm_ops);

create index if not exists immigration_projects_org_opened_idx
  on public.immigration_projects (organization_id, opened_at desc, id desc);

alter table public.booking_appointments
  add column if not exists email_lookup_hash text;

create index if not exists booking_appointments_org_email_lookup_idx
  on public.booking_appointments (organization_id, email_lookup_hash)
  where email_lookup_hash is not null;

create index if not exists project_document_files_person_id_idx
  on public.project_document_files (person_id);

create index if not exists project_status_history_project_status_at_idx
  on public.project_status_history (project_id, status_at desc);

-- One SELECT policy instead of two permissive policies on profiles.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_same_org on public.profiles;

create policy profiles_select_visible
  on public.profiles
  for select
  to authenticated
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = profiles.id
    )
  );

-- RLS still needs authenticated EXECUTE. Hide from anon / PUBLIC Data API callers.
revoke all on function public.can_access_person(uuid) from public, anon;
revoke all on function public.can_access_project(uuid) from public, anon;
revoke all on function public.can_delete_person(uuid) from public, anon;
revoke all on function public.can_delete_project(uuid) from public, anon;
revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_full_access(uuid) from public, anon;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_role(uuid, text[]) from public, anon;

alter function public.can_access_person(uuid) stable;
alter function public.can_access_project(uuid) stable;
alter function public.can_delete_person(uuid) stable;
alter function public.can_delete_project(uuid) stable;
alter function public.is_org_admin(uuid) stable;
alter function public.is_org_full_access(uuid) stable;
alter function public.is_org_member(uuid) stable;
alter function public.is_org_role(uuid, text[]) stable;

insert into storage.buckets (id, name, public, file_size_limit)
values ('ircc-blanks', 'ircc-blanks', false, 20971520)
on conflict (id) do nothing;
