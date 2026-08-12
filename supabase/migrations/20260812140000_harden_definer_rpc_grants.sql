-- Phase 0 (PIPEDA safeguards): privileged SECURITY DEFINER RPCs are
-- service_role-only. Callers must verify the session in a server action, then
-- pass p_actor_user_id. RLS helper is_org_member stays executable by
-- authenticated (required for policies) but is revoked from anon/PUBLIC.

-- ---------------------------------------------------------------------------
-- create_organization: drop JWT-bound overload; actor passed explicitly
-- ---------------------------------------------------------------------------
drop function if exists public.create_organization(text, text);

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
  values (v_org.id, p_actor_user_id, 'owner');

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, uuid) from public;
revoke all on function public.create_organization(text, text, uuid) from anon;
revoke all on function public.create_organization(text, text, uuid) from authenticated;
grant execute on function public.create_organization(text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- set_customer_portal_password: actor + service_role only
-- ---------------------------------------------------------------------------
drop function if exists public.set_customer_portal_password(uuid, text);

create or replace function public.set_customer_portal_password(
  p_customer_id uuid,
  p_password text,
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

  if p_password is null or char_length(p_password) < 10 then
    raise exception 'Password must be at least 10 characters';
  end if;

  select * into v_person
  from public.people p
  where p.id = p_customer_id;

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

  insert into private.customer_portal_secrets (person_id, password_hash)
  values (
    v_person.id,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  )
  on conflict (person_id) do update
    set password_hash = excluded.password_hash,
        updated_at = now();

  return v_access;
end;
$function$;

revoke all on function public.set_customer_portal_password(uuid, text, uuid) from public;
revoke all on function public.set_customer_portal_password(uuid, text, uuid) from anon;
revoke all on function public.set_customer_portal_password(uuid, text, uuid) from authenticated;
grant execute on function public.set_customer_portal_password(uuid, text, uuid) to service_role;

-- verify_customer_portal_login already service_role-only; reaffirm grants
revoke all on function public.verify_customer_portal_login(text, text) from public;
revoke all on function public.verify_customer_portal_login(text, text) from anon;
revoke all on function public.verify_customer_portal_login(text, text) from authenticated;
grant execute on function public.verify_customer_portal_login(text, text) to service_role;

-- is_org_member: needed by RLS for authenticated; never for anon
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_member(uuid) from anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to service_role;

-- Org role helper for future least-privilege policies (authenticated + service)
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

revoke all on function public.is_org_role(uuid, text[]) from public;
revoke all on function public.is_org_role(uuid, text[]) from anon;
grant execute on function public.is_org_role(uuid, text[]) to authenticated;
grant execute on function public.is_org_role(uuid, text[]) to service_role;
