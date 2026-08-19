-- Rename consultant → case_manager and drop assistant.
-- Existing consultants and assistants become case managers (full caseload).
-- Project-level assistant shares are no longer needed.

-- ---------------------------------------------------------------------------
-- Detach policies and helpers that pin old enum labels
-- ---------------------------------------------------------------------------
drop policy if exists organization_members_delete_admin on public.organization_members;
drop policy if exists organization_members_update_admin on public.organization_members;

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
      and m.role::text = 'admin'
  );
$function$;

create or replace function public.org_has_other_admin(
  p_organization_id uuid,
  p_user_id uuid
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
      and m.role::text = 'admin'
      and m.user_id is distinct from p_user_id
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
      and m.role::text in ('admin', 'consultant', 'case_manager')
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
      and public.is_org_full_access(p.organization_id)
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
          public.is_org_role(
            p.organization_id,
            array['consultant', 'case_manager']
          )
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
          public.is_org_role(
            pe.organization_id,
            array['consultant', 'case_manager']
          )
          and pe.created_by = (select auth.uid())
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- Recreate org_member_role: admin | case_manager
-- ---------------------------------------------------------------------------
alter table public.organization_members alter column role drop default;

create type public.org_member_role_new as enum ('admin', 'case_manager');

alter table public.organization_members
  alter column role type public.org_member_role_new
  using (
    case role::text
      when 'admin' then 'admin'
      else 'case_manager'
    end
  )::public.org_member_role_new;

alter table public.organization_invitations
  alter column role type public.org_member_role_new
  using (
    case role::text
      when 'admin' then 'admin'
      else 'case_manager'
    end
  )::public.org_member_role_new;

drop type public.org_member_role;
alter type public.org_member_role_new rename to org_member_role;

alter table public.organization_members
  alter column role set default 'case_manager'::public.org_member_role;

-- ---------------------------------------------------------------------------
-- Helpers on the new enum
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

create or replace function public.org_has_other_admin(
  p_organization_id uuid,
  p_user_id uuid
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
      and m.role = 'admin'::public.org_member_role
      and m.user_id is distinct from p_user_id
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
      and m.role in (
        'admin'::public.org_member_role,
        'case_manager'::public.org_member_role
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
          public.is_org_role(p.organization_id, array['case_manager'])
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
          public.is_org_role(pe.organization_id, array['case_manager'])
          and pe.created_by = (select auth.uid())
        )
      )
  );
$function$;

create policy organization_members_delete_admin
  on public.organization_members for delete to authenticated
  using (
    public.is_org_admin(organization_id)
    and (
      role <> 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );

create policy organization_members_update_admin
  on public.organization_members for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (
    public.is_org_admin(organization_id)
    and (
      role = 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Drop unused assistant share table
-- ---------------------------------------------------------------------------
drop table if exists public.project_staff_access;
