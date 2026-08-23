-- Paid seats are entitlements, independent from organization membership.
-- Reductions and interval changes can be staged for the next Stripe renewal.

alter table public.organizations
  add column if not exists billing_pending_seat_quantity integer,
  add column if not exists billing_pending_interval text,
  add column if not exists billing_pending_effective_at timestamptz,
  add column if not exists stripe_subscription_schedule_id text;

alter table public.organizations
  drop constraint if exists organizations_billing_pending_seats_check,
  add constraint organizations_billing_pending_seats_check
    check (billing_pending_seat_quantity is null or billing_pending_seat_quantity >= 1),
  drop constraint if exists organizations_billing_pending_interval_check,
  add constraint organizations_billing_pending_interval_check
    check (billing_pending_interval is null or billing_pending_interval in ('month', 'year'));

alter table public.organization_members
  add column if not exists is_licensed boolean not null default true,
  add column if not exists licensed_at_renewal boolean;

alter table public.organization_invitations
  add column if not exists is_licensed boolean not null default true;

alter table public.organization_members
  drop constraint if exists organization_members_owner_licensed_check,
  add constraint organization_members_owner_licensed_check check (
    role <> 'owner'::public.org_member_role
    or (is_licensed and licensed_at_renewal is distinct from false)
  );

create or replace function public.is_org_licensed(p_organization_id uuid)
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
      and m.is_licensed
  );
$function$;

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
      and m.is_licensed
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
      and m.is_licensed
      and m.role = 'owner'::public.org_member_role
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
      and m.is_licensed
      and m.role in (
        'owner'::public.org_member_role,
        'admin'::public.org_member_role,
        'case_manager'::public.org_member_role
      )
  );
$function$;

revoke all on function public.is_org_licensed(uuid) from public, anon;
grant execute on function public.is_org_licensed(uuid) to authenticated, service_role;

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
      and m.is_licensed
      and m.role in (
        'owner'::public.org_member_role,
        'admin'::public.org_member_role
      )
      and m.user_id is distinct from p_user_id
  );
$function$;

create or replace function public.assert_org_seat_cap(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subscribed boolean;
  v_seats integer;
  v_members integer;
begin
  perform pg_advisory_xact_lock(87223025, hashtext(p_organization_id::text));

  select o.subscribed_at is not null, coalesce(o.billing_seat_quantity, 1)
    into v_subscribed, v_seats
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not found or not v_subscribed then
    return;
  end if;

  select count(*)::integer into v_members
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.is_licensed;

  if v_members > v_seats then
    raise exception 'seats_exceeded' using errcode = 'P0001';
  end if;
end;
$function$;

create or replace function public.assert_org_invite_seat_cap(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subscribed boolean;
  v_seats integer;
  v_members integer;
  v_pending integer;
begin
  perform pg_advisory_xact_lock(87223025, hashtext(p_organization_id::text));

  select o.subscribed_at is not null, coalesce(o.billing_seat_quantity, 1)
    into v_subscribed, v_seats
  from public.organizations o
  where o.id = p_organization_id
  for update;

  if not found or not v_subscribed then
    return;
  end if;

  select count(*)::integer into v_members
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.is_licensed;

  select count(*)::integer into v_pending
  from public.organization_invitations i
  where i.organization_id = p_organization_id
    and i.is_licensed
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();

  if v_members + v_pending > v_seats then
    raise exception 'seats_exceeded' using errcode = 'P0001';
  end if;
end;
$function$;

drop trigger if exists organization_members_seat_cap on public.organization_members;
create trigger organization_members_seat_cap
  after insert or update of is_licensed, organization_id
  on public.organization_members
  for each row
  execute function public.enforce_org_member_seat_cap();

drop trigger if exists organization_invitations_seat_cap on public.organization_invitations;
create trigger organization_invitations_seat_cap
  after insert or update of is_licensed, accepted_at, revoked_at, expires_at, organization_id
  on public.organization_invitations
  for each row
  when (new.is_licensed and new.accepted_at is null and new.revoked_at is null)
  execute function public.enforce_org_invite_seat_cap();

revoke all on function public.enforce_org_member_seat_cap()
  from public, anon, authenticated;
revoke all on function public.enforce_org_invite_seat_cap()
  from public, anon, authenticated;

create or replace function public.stage_org_renewal_licenses(
  p_organization_id uuid,
  p_licensed_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target integer;
  v_owner_id uuid;
  v_selected integer;
begin
  if not public.is_org_admin(p_organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(87223025, hashtext(p_organization_id::text));

  select coalesce(o.billing_pending_seat_quantity, o.billing_seat_quantity)
    into v_target
  from public.organizations o
  where o.id = p_organization_id
  for update;

  select m.id into v_owner_id
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.role = 'owner'::public.org_member_role;

  if v_owner_id is null or not (v_owner_id = any(coalesce(p_licensed_member_ids, array[]::uuid[]))) then
    raise exception 'owner_must_be_licensed' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_selected
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.id = any(coalesce(p_licensed_member_ids, array[]::uuid[]));

  if v_selected <> cardinality(coalesce(p_licensed_member_ids, array[]::uuid[]))
    or v_selected > coalesce(v_target, 1) then
    raise exception 'invalid_license_roster' using errcode = 'P0001';
  end if;

  update public.organization_members m
  set licensed_at_renewal =
    (m.id = any(coalesce(p_licensed_member_ids, array[]::uuid[])))
  where m.organization_id = p_organization_id;
end;
$function$;

revoke all on function public.stage_org_renewal_licenses(uuid, uuid[]) from public, anon;
grant execute on function public.stage_org_renewal_licenses(uuid, uuid[])
  to authenticated, service_role;

create or replace function public.apply_org_renewal_licenses(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(87223025, hashtext(p_organization_id::text));

  update public.organization_members
  set is_licensed = coalesce(licensed_at_renewal, is_licensed),
      licensed_at_renewal = null
  where organization_id = p_organization_id;
end;
$function$;

revoke all on function public.apply_org_renewal_licenses(uuid) from public, anon, authenticated;
grant execute on function public.apply_org_renewal_licenses(uuid) to service_role;

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or p_new_owner_user_id is null or p_new_owner_user_id = v_actor then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = v_actor
      and m.role = 'owner'::public.org_member_role
      and m.is_licensed
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_new_owner_user_id
      and m.is_licensed
      and m.licensed_at_renewal is distinct from false
  ) then
    raise exception 'target_must_be_licensed' using errcode = 'P0001';
  end if;

  update public.organization_members
  set role = 'admin'::public.org_member_role
  where organization_id = p_organization_id
    and user_id = v_actor
    and role = 'owner'::public.org_member_role;

  update public.organization_members
  set role = 'owner'::public.org_member_role
  where organization_id = p_organization_id
    and user_id = p_new_owner_user_id;
end;
$function$;

revoke all on function public.transfer_organization_ownership(uuid, uuid)
  from public, anon;
grant execute on function public.transfer_organization_ownership(uuid, uuid)
  to authenticated, service_role;

-- Defense in depth for older policies that intentionally use is_org_member()
-- for reads and writes. Unlicensed staff keep SELECT access, but every direct
-- authenticated write to an organization-scoped table is rejected.
create or replace function public.reject_unlicensed_org_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_organization_id uuid;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
  else
    v_organization_id := new.organization_id;
  end if;

  -- The create_organization RPC inserts the first owner membership before
  -- is_org_licensed() can become true. RLS/RPC authorization still controls
  -- who can perform this bootstrap insert.
  if tg_table_name = 'organization_members'
    and tg_op = 'INSERT'
    and new.user_id = (select auth.uid())
    and not exists (
      select 1
      from public.organization_members m
      where m.organization_id = v_organization_id
    )
  then
    return new;
  end if;

  if not public.is_org_licensed(v_organization_id) then
    raise exception 'unlicensed_read_only' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

revoke all on function public.reject_unlicensed_org_write()
  from public, anon, authenticated;

do $block$
declare
  v_table record;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'organization_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'drop trigger if exists licensed_write_guard on public.%I',
      v_table.table_name
    );
    execute format(
      'create trigger licensed_write_guard before insert or update or delete on public.%I for each row execute function public.reject_unlicensed_org_write()',
      v_table.table_name
    );
  end loop;
end;
$block$;
