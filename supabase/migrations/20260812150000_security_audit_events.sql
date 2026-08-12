-- Phase 2: immutable-style security audit log (insert via service_role only)

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_kind text not null
    check (actor_kind in ('staff', 'share_link', 'system', 'service')),
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_org_created_idx
  on public.security_audit_events (organization_id, created_at desc);

create index if not exists security_audit_events_action_idx
  on public.security_audit_events (action, created_at desc);

alter table public.security_audit_events enable row level security;

drop policy if exists security_audit_events_select_admin on public.security_audit_events;
create policy security_audit_events_select_admin
  on public.security_audit_events
  for select
  to authenticated
  using (
    organization_id is not null
    and public.is_org_role(organization_id, array['owner', 'admin'])
  );

revoke all on table public.security_audit_events from anon;
grant select on table public.security_audit_events to authenticated;
grant all on table public.security_audit_events to service_role;

-- Organization updates: owner/admin only
drop policy if exists organizations_update_member on public.organizations;
drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin
  on public.organizations
  for update
  to authenticated
  using (public.is_org_role(id, array['owner', 'admin']))
  with check (public.is_org_role(id, array['owner', 'admin']));

-- Person hard-delete: owner/admin only (members can still create/update)
drop policy if exists people_delete_member on public.people;
drop policy if exists people_delete_admin on public.people;
create policy people_delete_admin
  on public.people
  for delete
  to authenticated
  using (public.is_org_role(organization_id, array['owner', 'admin']));
