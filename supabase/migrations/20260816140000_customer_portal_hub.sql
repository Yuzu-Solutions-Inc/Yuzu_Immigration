-- Client portal hub: first-time password setup, staff enable/reset,
-- rate-limit events, and audit actor kinds.

alter table public.security_audit_events
  drop constraint if exists security_audit_events_actor_kind_check;

alter table public.security_audit_events
  add constraint security_audit_events_actor_kind_check
  check (
    actor_kind = any (
      array[
        'staff'::text,
        'share_link'::text,
        'public_booking'::text,
        'portal'::text,
        'system'::text,
        'service'::text
      ]
    )
  );

create table if not exists public.portal_auth_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  access_hash text not null,
  kind text not null check (kind in ('verify_fail', 'forgot_password')),
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists portal_auth_events_lookup_idx
  on public.portal_auth_events (organization_id, access_hash, kind, created_at desc);

alter table public.portal_auth_events enable row level security;

revoke all on table public.portal_auth_events from public;
revoke all on table public.portal_auth_events from anon;
revoke all on table public.portal_auth_events from authenticated;
grant select, insert on table public.portal_auth_events to service_role;

create or replace function public.lookup_customer_portal_access(p_access_id text)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access public.customer_portal_access;
begin
  if p_access_id is null or length(trim(p_access_id)) = 0 then
    return null;
  end if;

  select a.* into v_access
  from public.customer_portal_access a
  where a.is_active = true
    and (a.expires_at is null or a.expires_at > now())
    and (
      a.access_code = upper(trim(p_access_id))
      or a.access_token::text = lower(trim(p_access_id))
    )
  limit 1;

  return v_access;
end;
$function$;

revoke all on function public.lookup_customer_portal_access(text) from public;
revoke all on function public.lookup_customer_portal_access(text) from anon;
revoke all on function public.lookup_customer_portal_access(text) from authenticated;
grant execute on function public.lookup_customer_portal_access(text) to service_role;

create or replace function public.customer_portal_password_exists(p_access_id text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access public.customer_portal_access;
begin
  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return false;
  end if;

  return exists (
    select 1
    from private.customer_portal_secrets s
    where s.person_id = v_access.person_id
  );
end;
$function$;

revoke all on function public.customer_portal_password_exists(text) from public;
revoke all on function public.customer_portal_password_exists(text) from anon;
revoke all on function public.customer_portal_password_exists(text) from authenticated;
grant execute on function public.customer_portal_password_exists(text) to service_role;

create or replace function public.enable_customer_portal(
  p_person_id uuid,
  p_actor_user_id uuid
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select * into v_person
  from public.people p
  where p.id = p_person_id;

  if v_person.id is null then
    raise exception 'Person not found';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized';
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
  on conflict (person_id) do update
    set is_active = true,
        updated_at = now()
  returning * into v_access;

  return v_access;
end;
$function$;

revoke all on function public.enable_customer_portal(uuid, uuid) from public;
revoke all on function public.enable_customer_portal(uuid, uuid) from anon;
revoke all on function public.enable_customer_portal(uuid, uuid) from authenticated;
grant execute on function public.enable_customer_portal(uuid, uuid) to service_role;

create or replace function public.set_customer_portal_active(
  p_person_id uuid,
  p_actor_user_id uuid,
  p_is_active boolean
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select * into v_person
  from public.people p
  where p.id = p_person_id;

  if v_person.id is null then
    raise exception 'Person not found';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized';
  end if;

  update public.customer_portal_access
  set is_active = p_is_active,
      updated_at = now()
  where person_id = p_person_id
  returning * into v_access;

  if v_access.id is null then
    raise exception 'Portal access not found';
  end if;

  return v_access;
end;
$function$;

revoke all on function public.set_customer_portal_active(uuid, uuid, boolean) from public;
revoke all on function public.set_customer_portal_active(uuid, uuid, boolean) from anon;
revoke all on function public.set_customer_portal_active(uuid, uuid, boolean) from authenticated;
grant execute on function public.set_customer_portal_active(uuid, uuid, boolean) to service_role;

create or replace function public.reset_customer_portal_password(
  p_access_id text
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access public.customer_portal_access;
begin
  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return null;
  end if;

  update public.customer_portal_access
  set access_token = gen_random_uuid(),
      updated_at = now()
  where id = v_access.id
  returning * into v_access;

  delete from private.customer_portal_secrets
  where person_id = v_access.person_id;

  return v_access;
end;
$function$;

revoke all on function public.reset_customer_portal_password(text) from public;
revoke all on function public.reset_customer_portal_password(text) from anon;
revoke all on function public.reset_customer_portal_password(text) from authenticated;
grant execute on function public.reset_customer_portal_password(text) to service_role;

create or replace function public.staff_reset_customer_portal(
  p_person_id uuid,
  p_actor_user_id uuid
)
returns public.customer_portal_access
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_person public.people;
  v_access public.customer_portal_access;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select * into v_person
  from public.people p
  where p.id = p_person_id;

  if v_person.id is null then
    raise exception 'Person not found';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
  ) then
    raise exception 'Not authorized';
  end if;

  select * into v_access
  from public.customer_portal_access a
  where a.person_id = p_person_id;

  if v_access.id is null then
    raise exception 'Portal access not found';
  end if;

  update public.customer_portal_access
  set access_token = gen_random_uuid(),
      is_active = true,
      updated_at = now()
  where id = v_access.id
  returning * into v_access;

  delete from private.customer_portal_secrets
  where person_id = v_access.person_id;

  return v_access;
end;
$function$;

revoke all on function public.staff_reset_customer_portal(uuid, uuid) from public;
revoke all on function public.staff_reset_customer_portal(uuid, uuid) from anon;
revoke all on function public.staff_reset_customer_portal(uuid, uuid) from authenticated;
grant execute on function public.staff_reset_customer_portal(uuid, uuid) to service_role;

create or replace function public.client_set_customer_portal_password(
  p_access_id text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_access public.customer_portal_access;
begin
  if p_password is null
     or char_length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[0-9]'
     or p_password !~ '[^A-Za-z0-9]'
  then
    raise exception 'invalid_password';
  end if;

  v_access := public.lookup_customer_portal_access(p_access_id);
  if v_access.id is null then
    return false;
  end if;

  if exists (
    select 1
    from private.customer_portal_secrets s
    where s.person_id = v_access.person_id
  ) then
    raise exception 'password_already_set';
  end if;

  insert into private.customer_portal_secrets (person_id, password_hash)
  values (
    v_access.person_id,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  );

  update public.customer_portal_access
  set last_authenticated_at = now(),
      updated_at = now()
  where id = v_access.id;

  return true;
end;
$function$;

revoke all on function public.client_set_customer_portal_password(text, text) from public;
revoke all on function public.client_set_customer_portal_password(text, text) from anon;
revoke all on function public.client_set_customer_portal_password(text, text) from authenticated;
grant execute on function public.client_set_customer_portal_password(text, text) to service_role;
