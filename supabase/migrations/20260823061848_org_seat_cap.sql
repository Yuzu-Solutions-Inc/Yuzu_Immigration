-- Subscribed firms cannot occupy more staff seats than they pay for.
-- Occupancy is members plus unexpired pending invites. Trial orgs are uncapped.

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
  where m.organization_id = p_organization_id;

  if v_members > v_seats then
    raise exception 'seats_exceeded' using errcode = 'P0001';
  end if;
end;
$function$;

comment on function public.assert_org_seat_cap(uuid) is
  'Raises seats_exceeded when a subscribed org has more members than billed seats.';

revoke all on function public.assert_org_seat_cap(uuid) from public, anon, authenticated;
grant execute on function public.assert_org_seat_cap(uuid) to service_role;

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
  where m.organization_id = p_organization_id;

  select count(*)::integer into v_pending
  from public.organization_invitations i
  where i.organization_id = p_organization_id
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();

  if v_members + v_pending > v_seats then
    raise exception 'seats_exceeded' using errcode = 'P0001';
  end if;
end;
$function$;

comment on function public.assert_org_invite_seat_cap(uuid) is
  'Raises seats_exceeded when members plus pending invites exceed billed seats.';

revoke all on function public.assert_org_invite_seat_cap(uuid) from public, anon, authenticated;
grant execute on function public.assert_org_invite_seat_cap(uuid) to service_role;

create or replace function public.enforce_org_member_seat_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.assert_org_seat_cap(new.organization_id);
  return new;
end;
$function$;

create or replace function public.enforce_org_invite_seat_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.assert_org_invite_seat_cap(new.organization_id);
  return new;
end;
$function$;

drop trigger if exists organization_members_seat_cap on public.organization_members;
create trigger organization_members_seat_cap
  after insert on public.organization_members
  for each row
  execute function public.enforce_org_member_seat_cap();

drop trigger if exists organization_invitations_seat_cap on public.organization_invitations;
create trigger organization_invitations_seat_cap
  after insert on public.organization_invitations
  for each row
  when (new.accepted_at is null and new.revoked_at is null)
  execute function public.enforce_org_invite_seat_cap();
