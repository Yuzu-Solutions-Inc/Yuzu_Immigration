-- Make licensing explicit in write policies and service-role portal RPCs.
-- Membership-only SELECT policies intentionally remain unchanged.

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
      and m.is_licensed
      and m.role::text = any (p_roles)
  );
$function$;

-- Rebuild legacy write policies in place, preserving their role/user checks
-- while replacing membership-only authorization with licensed authorization.
do $block$
declare
  v_policy record;
  v_roles text;
  v_sql text;
begin
  for v_policy in
    select *
    from pg_policies
    where schemaname = 'public'
      and policyname = any (array[
        'booking_availability_insert',
        'booking_availability_update',
        'booking_availability_delete',
        'booking_blocked_insert',
        'booking_blocked_delete',
        'booking_microsoft_busy_insert',
        'booking_microsoft_busy_update',
        'booking_microsoft_busy_delete',
        'booking_service_links_insert_access',
        'booking_service_links_update_access',
        'booking_service_links_delete_access',
        'google_calendar_connections_insert',
        'google_calendar_connections_update',
        'google_calendar_connections_delete',
        'inbound_messages_insert_member',
        'inbound_messages_update_member',
        'inbound_attachments_update_member',
        'microsoft_calendar_connections_insert',
        'microsoft_calendar_connections_update',
        'microsoft_calendar_connections_delete',
        'organization_programs_insert',
        'organization_programs_update',
        'organization_programs_delete',
        'payment_requests_insert',
        'payment_requests_update',
        'person_notes_insert_access',
        'project_booking_invites_insert_access',
        'project_notes_insert_access',
        'project_participants_insert_access',
        'staff_booking_integrations_insert',
        'staff_booking_integrations_update',
        'staff_booking_integrations_delete',
        'staff_contract_signatures_insert',
        'staff_contract_signatures_update',
        'staff_contract_signatures_delete',
        'staff_notifications_update_own',
        'staff_notifications_delete_own',
        'staff_onboarding_insert_own',
        'staff_onboarding_update_own',
        'zoom_connections_insert',
        'zoom_connections_update',
        'zoom_connections_delete'
      ])
  loop
    select string_agg(quote_ident(role_name), ', ')
      into v_roles
    from unnest(v_policy.roles) role_name;

    execute format(
      'drop policy if exists %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      v_policy.permissive,
      v_policy.cmd,
      v_roles
    );
    if v_policy.qual is not null then
      v_sql := v_sql || format(
        ' using (%s)',
        replace(v_policy.qual, 'is_org_member', 'is_org_licensed')
      );
    end if;
    if v_policy.with_check is not null then
      v_sql := v_sql || format(
        ' with check (%s)',
        replace(v_policy.with_check, 'is_org_member', 'is_org_licensed')
      );
    end if;
    execute v_sql;
  end loop;
end;
$block$;

-- Remove weaker permissive-OR note policies. The access policies remain.
drop policy if exists person_notes_insert_member on public.person_notes;
drop policy if exists person_notes_update_member on public.person_notes;

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
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.customer_portal_access (
    person_id, organization_id, access_code, is_active
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
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.customer_portal_access (
    person_id, organization_id, access_code, is_active
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
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
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
  select * into v_person from public.people p where p.id = p_person_id;
  if v_person.id is null then
    raise exception 'Person not found';
  end if;
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_person.organization_id
      and m.user_id = p_actor_user_id
      and m.is_licensed
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

revoke all on function public.set_customer_portal_password(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.enable_customer_portal(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_customer_portal_active(uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.staff_reset_customer_portal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.set_customer_portal_password(uuid, text, uuid)
  to service_role;
grant execute on function public.enable_customer_portal(uuid, uuid)
  to service_role;
grant execute on function public.set_customer_portal_active(uuid, uuid, boolean)
  to service_role;
grant execute on function public.staff_reset_customer_portal(uuid, uuid)
  to service_role;
