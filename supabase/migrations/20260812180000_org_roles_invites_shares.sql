-- Staff roles: admin / consultant / assistant
-- Invitations, project shares for assistants, created_by for consultant deletes.

-- ---------------------------------------------------------------------------
-- Recreate org_member_role enum
-- ---------------------------------------------------------------------------
alter table public.organization_members alter column role drop default;

create type public.org_member_role_new as enum ('admin', 'consultant', 'assistant');

alter table public.organization_members
  alter column role type public.org_member_role_new
  using (
    case role::text
      when 'owner' then 'admin'
      when 'admin' then 'admin'
      when 'member' then 'consultant'
      when 'consultant' then 'consultant'
      when 'assistant' then 'assistant'
      else 'consultant'
    end
  )::public.org_member_role_new;

drop type public.org_member_role;
alter type public.org_member_role_new rename to org_member_role;

alter table public.organization_members
  alter column role set default 'consultant'::public.org_member_role;

-- ---------------------------------------------------------------------------
-- created_by for consultant-owned deletes
-- ---------------------------------------------------------------------------
alter table public.people
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.immigration_projects
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

create or replace function public.set_created_by_from_auth()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  if new.created_by is null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$function$;

drop trigger if exists people_set_created_by on public.people;
create trigger people_set_created_by
  before insert on public.people
  for each row execute function public.set_created_by_from_auth();

drop trigger if exists immigration_projects_set_created_by on public.immigration_projects;
create trigger immigration_projects_set_created_by
  before insert on public.immigration_projects
  for each row execute function public.set_created_by_from_auth();

-- ---------------------------------------------------------------------------
-- Assistant project shares
-- ---------------------------------------------------------------------------
create table if not exists public.project_staff_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.immigration_projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_staff_access_user_idx
  on public.project_staff_access (user_id, organization_id);

create index if not exists project_staff_access_project_idx
  on public.project_staff_access (project_id);

alter table public.project_staff_access enable row level security;

-- ---------------------------------------------------------------------------
-- Email invitations
-- ---------------------------------------------------------------------------
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_member_role not null,
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, created_at desc);

alter table public.organization_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- create_organization: first member is admin
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_actor_user_id uuid
)
returns public.organizations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org public.organizations;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_actor_user_id) then
    raise exception 'Profile missing for user';
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), lower(trim(p_slug)))
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, p_actor_user_id, 'admin');

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, uuid) from public;
revoke all on function public.create_organization(text, text, uuid) from anon;
revoke all on function public.create_organization(text, text, uuid) from authenticated;
grant execute on function public.create_organization(text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER, authenticated + service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'::public.org_member_role
  );
$function$;

create or replace function public.is_org_full_access(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('admin'::public.org_member_role, 'consultant'::public.org_member_role)
  );
$function$;

create or replace function public.can_access_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.immigration_projects p
    where p.id = p_project_id
      and (
        public.is_org_full_access(p.organization_id)
        or exists (
          select 1
          from public.project_staff_access a
          where a.project_id = p.id
            and a.user_id = (select auth.uid())
        )
      )
  );
$function$;

create or replace function public.can_access_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.people pe
    where pe.id = p_person_id
      and (
        public.is_org_full_access(pe.organization_id)
        or exists (
          select 1
          from public.project_participants pp
          where pp.person_id = pe.id
            and pp.left_at is null
            and public.can_access_project(pp.project_id)
        )
      )
  );
$function$;

create or replace function public.can_delete_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.immigration_projects p
    where p.id = p_project_id
      and (
        public.is_org_admin(p.organization_id)
        or (
          public.is_org_role(p.organization_id, array['consultant'])
          and p.created_by = (select auth.uid())
        )
      )
  );
$function$;

create or replace function public.can_delete_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.people pe
    where pe.id = p_person_id
      and (
        public.is_org_admin(pe.organization_id)
        or (
          public.is_org_role(pe.organization_id, array['consultant'])
          and pe.created_by = (select auth.uid())
        )
      )
  );
$function$;

-- Keep is_org_role in sync with new enum labels
create or replace function public.is_org_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role::text = any (p_roles)
  );
$function$;

revoke all on function public.is_org_admin(uuid) from public, anon;
revoke all on function public.is_org_full_access(uuid) from public, anon;
revoke all on function public.can_access_project(uuid) from public, anon;
revoke all on function public.can_access_person(uuid) from public, anon;
revoke all on function public.can_delete_project(uuid) from public, anon;
revoke all on function public.can_delete_person(uuid) from public, anon;
revoke all on function public.is_org_role(uuid, text[]) from public, anon;

grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.is_org_full_access(uuid) to authenticated, service_role;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;
grant execute on function public.can_access_person(uuid) to authenticated, service_role;
grant execute on function public.can_delete_project(uuid) to authenticated, service_role;
grant execute on function public.can_delete_person(uuid) to authenticated, service_role;
grant execute on function public.is_org_role(uuid, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: drop old member-wide policies and recreate
-- ---------------------------------------------------------------------------

-- organizations
drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
  on public.organizations for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- organization_members
drop policy if exists organization_members_select_same_org on public.organization_members;
drop policy if exists organization_members_insert_same_org on public.organization_members;
drop policy if exists organization_members_update_same_org on public.organization_members;
drop policy if exists organization_members_delete_same_org on public.organization_members;

create policy organization_members_select_same_org
  on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_insert_admin
  on public.organization_members for insert to authenticated
  with check (public.is_org_admin(organization_id));

create policy organization_members_update_admin
  on public.organization_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy organization_members_delete_admin
  on public.organization_members for delete to authenticated
  using (public.is_org_admin(organization_id));

-- invitations (admin read; writes via service_role)
drop policy if exists organization_invitations_select_admin on public.organization_invitations;
create policy organization_invitations_select_admin
  on public.organization_invitations for select to authenticated
  using (public.is_org_admin(organization_id));

revoke all on table public.organization_invitations from anon, authenticated;
grant select on table public.organization_invitations to authenticated;
grant all on table public.organization_invitations to service_role;

-- project_staff_access
drop policy if exists project_staff_access_select on public.project_staff_access;
drop policy if exists project_staff_access_insert on public.project_staff_access;
drop policy if exists project_staff_access_delete on public.project_staff_access;

create policy project_staff_access_select
  on public.project_staff_access for select to authenticated
  using (
    public.is_org_full_access(organization_id)
    or user_id = (select auth.uid())
  );

create policy project_staff_access_insert
  on public.project_staff_access for insert to authenticated
  with check (
    public.is_org_full_access(organization_id)
    and public.can_access_project(project_id)
  );

create policy project_staff_access_delete
  on public.project_staff_access for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, delete on public.project_staff_access to authenticated;
grant all on public.project_staff_access to service_role;

-- people
drop policy if exists people_select_member on public.people;
drop policy if exists people_insert_member on public.people;
drop policy if exists people_update_member on public.people;
drop policy if exists people_delete_admin on public.people;
drop policy if exists people_delete_member on public.people;

create policy people_select_access
  on public.people for select to authenticated
  using (public.can_access_person(id));

create policy people_insert_staff
  on public.people for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy people_update_access
  on public.people for update to authenticated
  using (public.can_access_person(id))
  with check (public.can_access_person(id));

create policy people_delete_allowed
  on public.people for delete to authenticated
  using (public.can_delete_person(id));

-- immigration_projects
drop policy if exists immigration_projects_select_member on public.immigration_projects;
drop policy if exists immigration_projects_insert_member on public.immigration_projects;
drop policy if exists immigration_projects_update_member on public.immigration_projects;
drop policy if exists immigration_projects_delete_member on public.immigration_projects;

create policy immigration_projects_select_access
  on public.immigration_projects for select to authenticated
  using (public.can_access_project(id));

create policy immigration_projects_insert_staff
  on public.immigration_projects for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy immigration_projects_update_access
  on public.immigration_projects for update to authenticated
  using (public.can_access_project(id))
  with check (public.can_access_project(id));

create policy immigration_projects_delete_allowed
  on public.immigration_projects for delete to authenticated
  using (public.can_delete_project(id));

-- project_participants
drop policy if exists project_participants_select_member on public.project_participants;
drop policy if exists project_participants_insert_member on public.project_participants;
drop policy if exists project_participants_update_member on public.project_participants;
drop policy if exists project_participants_delete_member on public.project_participants;

create policy project_participants_select_access
  on public.project_participants for select to authenticated
  using (public.can_access_project(project_id));

create policy project_participants_insert_access
  on public.project_participants for insert to authenticated
  with check (
    public.can_access_project(project_id)
    and public.is_org_member(organization_id)
  );

create policy project_participants_update_access
  on public.project_participants for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_participants_delete_access
  on public.project_participants for delete to authenticated
  using (public.can_access_project(project_id));

-- person_notes
drop policy if exists person_notes_select_member on public.person_notes;
drop policy if exists person_notes_insert_member on public.person_notes;
drop policy if exists person_notes_update_member on public.person_notes;
drop policy if exists person_notes_delete_member on public.person_notes;

create policy person_notes_select_access
  on public.person_notes for select to authenticated
  using (public.can_access_person(person_id));

create policy person_notes_insert_access
  on public.person_notes for insert to authenticated
  with check (
    public.can_access_person(person_id)
    and public.is_org_member(organization_id)
  );

create policy person_notes_update_access
  on public.person_notes for update to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

create policy person_notes_delete_access
  on public.person_notes for delete to authenticated
  using (public.can_access_person(person_id));

-- project_status_history
drop policy if exists project_status_history_select_member on public.project_status_history;
drop policy if exists project_status_history_insert_member on public.project_status_history;

create policy project_status_history_select_access
  on public.project_status_history for select to authenticated
  using (public.can_access_project(project_id));

create policy project_status_history_insert_access
  on public.project_status_history for insert to authenticated
  with check (public.can_access_project(project_id));

-- project_forms
drop policy if exists project_forms_select_member on public.project_forms;
drop policy if exists project_forms_insert_member on public.project_forms;
drop policy if exists project_forms_update_member on public.project_forms;
drop policy if exists project_forms_delete_member on public.project_forms;

create policy project_forms_select_access
  on public.project_forms for select to authenticated
  using (public.can_access_project(project_id));

create policy project_forms_insert_access
  on public.project_forms for insert to authenticated
  with check (public.can_access_project(project_id));

create policy project_forms_update_access
  on public.project_forms for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_forms_delete_access
  on public.project_forms for delete to authenticated
  using (public.can_access_project(project_id));

-- project_form_answers
drop policy if exists project_form_answers_select_member on public.project_form_answers;
drop policy if exists project_form_answers_insert_member on public.project_form_answers;
drop policy if exists project_form_answers_update_member on public.project_form_answers;
drop policy if exists project_form_answers_delete_member on public.project_form_answers;

create policy project_form_answers_select_access
  on public.project_form_answers for select to authenticated
  using (public.can_access_project(project_id));

create policy project_form_answers_insert_access
  on public.project_form_answers for insert to authenticated
  with check (public.can_access_project(project_id));

create policy project_form_answers_update_access
  on public.project_form_answers for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_form_answers_delete_access
  on public.project_form_answers for delete to authenticated
  using (public.can_access_project(project_id));

-- form_share_links
drop policy if exists form_share_links_select_member on public.form_share_links;
drop policy if exists form_share_links_insert_member on public.form_share_links;
drop policy if exists form_share_links_update_member on public.form_share_links;
drop policy if exists form_share_links_delete_member on public.form_share_links;

create policy form_share_links_select_access
  on public.form_share_links for select to authenticated
  using (public.can_access_project(project_id));

create policy form_share_links_insert_access
  on public.form_share_links for insert to authenticated
  with check (public.can_access_project(project_id));

create policy form_share_links_update_access
  on public.form_share_links for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy form_share_links_delete_access
  on public.form_share_links for delete to authenticated
  using (public.can_access_project(project_id));

-- documents
drop policy if exists project_document_requests_select_member on public.project_document_requests;
drop policy if exists project_document_requests_insert_member on public.project_document_requests;
drop policy if exists project_document_requests_update_member on public.project_document_requests;
drop policy if exists project_document_requests_delete_member on public.project_document_requests;

create policy project_document_requests_select_access
  on public.project_document_requests for select to authenticated
  using (public.can_access_project(project_id));

create policy project_document_requests_insert_access
  on public.project_document_requests for insert to authenticated
  with check (public.can_access_project(project_id));

create policy project_document_requests_update_access
  on public.project_document_requests for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_document_requests_delete_access
  on public.project_document_requests for delete to authenticated
  using (
    public.can_access_project(project_id)
    and doc_key = 'custom'
  );

drop policy if exists project_document_files_select_member on public.project_document_files;
drop policy if exists project_document_files_insert_member on public.project_document_files;
drop policy if exists project_document_files_update_member on public.project_document_files;
drop policy if exists project_document_files_delete_member on public.project_document_files;

create policy project_document_files_select_access
  on public.project_document_files for select to authenticated
  using (public.can_access_project(project_id));

create policy project_document_files_insert_access
  on public.project_document_files for insert to authenticated
  with check (public.can_access_project(project_id));

create policy project_document_files_update_access
  on public.project_document_files for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_document_files_delete_access
  on public.project_document_files for delete to authenticated
  using (public.can_access_project(project_id));

-- customer_portal_access
drop policy if exists customer_portal_access_select_member on public.customer_portal_access;
drop policy if exists customer_portal_access_insert_member on public.customer_portal_access;
drop policy if exists customer_portal_access_update_member on public.customer_portal_access;
drop policy if exists customer_portal_access_delete_member on public.customer_portal_access;

create policy customer_portal_access_select_access
  on public.customer_portal_access for select to authenticated
  using (public.can_access_person(person_id));

create policy customer_portal_access_insert_access
  on public.customer_portal_access for insert to authenticated
  with check (public.can_access_person(person_id));

create policy customer_portal_access_update_access
  on public.customer_portal_access for update to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

create policy customer_portal_access_delete_access
  on public.customer_portal_access for delete to authenticated
  using (public.can_access_person(person_id));

-- audit / destruction: admin only (was owner+admin)
drop policy if exists security_audit_events_select_admin on public.security_audit_events;
create policy security_audit_events_select_admin
  on public.security_audit_events for select to authenticated
  using (
    organization_id is not null
    and public.is_org_admin(organization_id)
  );

drop policy if exists file_destruction_register_select_admin on public.file_destruction_register;
create policy file_destruction_register_select_admin
  on public.file_destruction_register for select to authenticated
  using (public.is_org_admin(organization_id));

-- storage: org folder + project folder
drop policy if exists client_documents_select_member on storage.objects;
drop policy if exists client_documents_insert_member on storage.objects;
drop policy if exists client_documents_update_member on storage.objects;
drop policy if exists client_documents_delete_member on storage.objects;

create policy client_documents_select_access
  on storage.objects for select to authenticated
  using (
    bucket_id = 'client-documents'
    and public.can_access_project(((storage.foldername(name))[2])::uuid)
  );

create policy client_documents_insert_access
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-documents'
    and public.can_access_project(((storage.foldername(name))[2])::uuid)
  );

create policy client_documents_update_access
  on storage.objects for update to authenticated
  using (
    bucket_id = 'client-documents'
    and public.can_access_project(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'client-documents'
    and public.can_access_project(((storage.foldername(name))[2])::uuid)
  );

create policy client_documents_delete_access
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'client-documents'
    and public.can_access_project(((storage.foldername(name))[2])::uuid)
  );
