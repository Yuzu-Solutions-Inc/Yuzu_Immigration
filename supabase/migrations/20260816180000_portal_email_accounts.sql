-- Portal signup is email-whitelisted against people rows.
-- Same email can exist at multiple firms; each person (per org) has one account.
-- Staff do not provision accounts; clients open /portal and register themselves.

alter table public.people
  add column if not exists portal_email_hash text;

create index if not exists people_portal_email_hash_idx
  on public.people (portal_email_hash)
  where portal_email_hash is not null;

alter table public.portal_auth_events
  alter column organization_id drop not null;

alter table public.portal_auth_events
  drop constraint if exists portal_auth_events_kind_check;

alter table public.portal_auth_events
  add constraint portal_auth_events_kind_check
  check (kind in ('verify_fail', 'forgot_password', 'identify'));

create or replace function public.client_open_customer_portal(p_person_id uuid)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_person_id is null then
    raise exception 'person required';
  end if;

  select * into v_person
  from public.people p
  where p.id = p_person_id;

  if v_person.id is null then
    raise exception 'Person not found';
  end if;

  select * into v_access
  from public.customer_portal_access a
  where a.person_id = v_person.id;

  if v_access.id is not null then
    return v_access;
  end if;

  insert into public.customer_portal_access (
    person_id,
    organization_id,
    access_code,
    is_active
  )
  values (
    v_person.id,
    v_person.organization_id,
    public.generate_customer_access_code(),
    true
  )
  returning * into v_access;

  return v_access;
end;
$function$;

revoke all on function public.client_open_customer_portal(uuid) from public;
revoke all on function public.client_open_customer_portal(uuid) from anon;
revoke all on function public.client_open_customer_portal(uuid) from authenticated;
grant execute on function public.client_open_customer_portal(uuid) to service_role;
