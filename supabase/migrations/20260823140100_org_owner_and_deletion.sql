-- Owner membership, contact-point semantics, and Loi 25 org offboarding.
-- Operational PII is deleted. A tombstone + de-identified IDs remain for
-- incident notification (Loi 25) and coarse product analytics.

alter table public.organizations
  add column if not exists deleted_at timestamptz,
  add column if not exists owner_contact_name text,
  add column if not exists owner_contact_email text;

comment on column public.organizations.deleted_at is
  'When set, the workspace is offboarded. Remaining columns are a Loi 25 tombstone.';
comment on column public.organizations.owner_contact_name is
  'Snapshot of the owner''s name at deletion, kept to contact the firm after a later confidentiality incident.';
comment on column public.organizations.owner_contact_email is
  'Snapshot of the owner''s email at deletion, kept to contact the firm after a later confidentiality incident.';

create unique index if not exists organizations_one_owner_idx
  on public.organization_members (organization_id)
  where role = 'owner'::public.org_member_role;

create table if not exists private.deleted_organization_entities (
  organization_id uuid not null references public.organizations (id),
  entity_kind text not null check (entity_kind in ('person', 'project', 'booking')),
  entity_id uuid not null,
  created_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  primary key (entity_kind, entity_id)
);

create index if not exists deleted_organization_entities_org_idx
  on private.deleted_organization_entities (organization_id, entity_kind);

comment on table private.deleted_organization_entities is
  'De-identified entity IDs kept after org deletion for product analytics. No names, files, or contact data.';

revoke all on table private.deleted_organization_entities from public, anon, authenticated;
grant all on table private.deleted_organization_entities to service_role;

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
      and m.role in (
        'owner'::public.org_member_role,
        'admin'::public.org_member_role
      )
  );
$function$;

create or replace function public.is_org_owner(p_organization_id uuid)
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
      and m.role = 'owner'::public.org_member_role
  );
$function$;

comment on function public.is_org_owner(uuid) is
  'True when the current user is the unique owner of the organization.';

revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;

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
        'owner'::public.org_member_role,
        'admin'::public.org_member_role,
        'case_manager'::public.org_member_role
      )
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
      and m.role in (
        'owner'::public.org_member_role,
        'admin'::public.org_member_role
      )
      and m.user_id is distinct from p_user_id
  );
$function$;
