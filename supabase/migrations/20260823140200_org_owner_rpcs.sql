-- Membership RLS, create/transfer RPCs, backfill, and Loi 25 purge.

drop policy if exists organization_members_delete_admin on public.organization_members;
create policy organization_members_delete_admin
  on public.organization_members for delete to authenticated
  using (
    public.is_org_admin(organization_id)
    and role <> 'owner'::public.org_member_role
    and (
      role <> 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );

drop policy if exists organization_members_update_admin on public.organization_members;
create policy organization_members_update_admin
  on public.organization_members for update to authenticated
  using (
    public.is_org_admin(organization_id)
    and role <> 'owner'::public.org_member_role
  )
  with check (
    public.is_org_admin(organization_id)
    and role <> 'owner'::public.org_member_role
    and (
      role = 'admin'::public.org_member_role
      or public.org_has_other_admin(organization_id, user_id)
    )
  );

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member
  on public.organizations for select to authenticated
  using (
    public.is_org_member(id)
    and deleted_at is null
  );

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

  perform pg_advisory_xact_lock(87223023);

  insert into public.organizations (name, slug, founding_rate)
  values (
    trim(p_name),
    lower(trim(p_slug)),
    (select count(*) from public.organizations) < 100
  )
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, p_actor_user_id, 'owner'::public.org_member_role);

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, uuid) to service_role;

with ranked as (
  select
    m.id,
    row_number() over (
      partition by m.organization_id
      order by
        case m.role::text when 'admin' then 0 else 1 end,
        m.created_at asc,
        m.id asc
    ) as n
  from public.organization_members m
  where not exists (
    select 1
    from public.organization_members o
    where o.organization_id = m.organization_id
      and o.role = 'owner'::public.org_member_role
  )
)
update public.organization_members m
set role = 'owner'::public.org_member_role
from ranked r
where m.id = r.id
  and r.n = 1;

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
  v_current uuid;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_new_owner_user_id is null or p_new_owner_user_id = v_actor then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  select m.user_id into v_current
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
    and m.role = 'owner'::public.org_member_role;

  if v_current is null then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_new_owner_user_id
  ) then
    raise exception 'not_member' using errcode = 'P0002';
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

revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated, service_role;

create or replace function private.purge_organization(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_owner_contact_name text,
  p_owner_contact_email text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_slug text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_actor_user_id
      and m.role = 'owner'::public.org_member_role
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.deleted_at is not null
  ) then
    raise exception 'already_deleted' using errcode = 'P0001';
  end if;

  insert into private.deleted_organization_entities (
    organization_id, entity_kind, entity_id, created_at, attributes
  )
  select
    p.organization_id,
    'person',
    p.id,
    p.created_at,
    '{}'::jsonb
  from public.people p
  where p.organization_id = p_organization_id
  on conflict do nothing;

  insert into private.deleted_organization_entities (
    organization_id, entity_kind, entity_id, created_at, attributes
  )
  select
    ip.organization_id,
    'project',
    ip.id,
    ip.created_at,
    jsonb_strip_nulls(jsonb_build_object(
      'status', ip.status,
      'program_family', ip.program_family,
      'jurisdiction', ip.jurisdiction
    ))
  from public.immigration_projects ip
  where ip.organization_id = p_organization_id
  on conflict do nothing;

  insert into private.deleted_organization_entities (
    organization_id, entity_kind, entity_id, created_at, attributes
  )
  select
    a.organization_id,
    'booking',
    a.id,
    a.created_at,
    jsonb_strip_nulls(jsonb_build_object('status', a.status))
  from public.booking_appointments a
  where a.organization_id = p_organization_id
  on conflict do nothing;

  delete from public.inbound_attachments where organization_id = p_organization_id;
  delete from public.contract_audit_events where organization_id = p_organization_id;
  delete from public.contract_signers where organization_id = p_organization_id;
  delete from public.booking_automation_sends where organization_id = p_organization_id;
  delete from public.booking_payment_reminder_sends where organization_id = p_organization_id;
  delete from public.booking_email_automation_services where organization_id = p_organization_id;
  delete from public.booking_service_form_fields where organization_id = p_organization_id;
  delete from public.booking_service_links where organization_id = p_organization_id;
  delete from public.contract_template_services where organization_id = p_organization_id;
  delete from public.project_document_files where organization_id = p_organization_id;
  delete from public.project_document_requests where organization_id = p_organization_id;
  delete from public.project_form_answers where organization_id = p_organization_id;
  delete from public.project_forms where organization_id = p_organization_id;
  delete from public.project_notes where organization_id = p_organization_id;
  delete from public.project_status_history where organization_id = p_organization_id;
  delete from public.project_participants where organization_id = p_organization_id;
  delete from public.project_booking_invites where organization_id = p_organization_id;
  delete from public.person_notes where organization_id = p_organization_id;
  delete from public.customer_portal_access where organization_id = p_organization_id;
  delete from public.portal_auth_events where organization_id = p_organization_id;
  delete from public.staff_notifications where organization_id = p_organization_id;
  delete from public.sage_tax_mappings where organization_id = p_organization_id;
  delete from public.staff_contract_signatures where organization_id = p_organization_id;
  delete from public.staff_booking_integrations where organization_id = p_organization_id;
  delete from public.booking_google_busy where organization_id = p_organization_id;
  delete from public.booking_microsoft_busy where organization_id = p_organization_id;
  delete from public.booking_abuse_events where organization_id = p_organization_id;
  delete from public.file_destruction_register where organization_id = p_organization_id;
  delete from public.security_audit_events where organization_id = p_organization_id;
  delete from public.outbound_emails where organization_id = p_organization_id;
  delete from public.inbound_messages where organization_id = p_organization_id;
  delete from public.contract_envelopes where organization_id = p_organization_id;
  delete from public.payment_requests where organization_id = p_organization_id;
  delete from public.booking_appointments where organization_id = p_organization_id;
  delete from public.people where organization_id = p_organization_id;
  delete from public.immigration_projects where organization_id = p_organization_id;
  delete from public.booking_availability_rules where organization_id = p_organization_id;
  delete from public.booking_blocked_times where organization_id = p_organization_id;
  delete from public.booking_service_email_automations where organization_id = p_organization_id;
  delete from public.booking_services where organization_id = p_organization_id;
  delete from public.booking_forms where organization_id = p_organization_id;
  delete from public.booking_settings where organization_id = p_organization_id;
  delete from public.contract_templates where organization_id = p_organization_id;
  delete from public.organization_programs where organization_id = p_organization_id;
  delete from public.organization_invitations where organization_id = p_organization_id;
  delete from public.google_calendar_connections where organization_id = p_organization_id;
  delete from public.microsoft_calendar_connections where organization_id = p_organization_id;
  delete from public.zoom_connections where organization_id = p_organization_id;
  delete from public.square_connections where organization_id = p_organization_id;
  delete from public.stripe_connections where organization_id = p_organization_id;
  delete from public.sage_connections where organization_id = p_organization_id;

  if to_regclass('public.staff_onboarding') is not null then
    execute 'delete from public.staff_onboarding where organization_id = $1'
      using p_organization_id;
  end if;

  v_slug := 'deleted-' || replace(p_organization_id::text, '-', '');

  update public.organizations
  set
    deleted_at = now(),
    owner_contact_name = nullif(trim(p_owner_contact_name), ''),
    owner_contact_email = nullif(lower(trim(p_owner_contact_email)), ''),
    wrapped_dek = null,
    slug = left(v_slug, 48),
    portal_google_login_enabled = false,
    dpa_accepted_by = null,
    subscribed_at = null,
    stripe_customer_id = null,
    stripe_subscription_id = null,
    billing_plan = null,
    billing_interval = null,
    updated_at = now()
  where id = p_organization_id;

  delete from public.organization_members
  where organization_id = p_organization_id;
end;
$function$;

revoke all on function private.purge_organization(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function private.purge_organization(uuid, uuid, text, text) to service_role;

create or replace function public.purge_organization(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_owner_contact_name text,
  p_owner_contact_email text
)
returns void
language sql
security definer
set search_path to ''
as $function$
  select private.purge_organization(
    p_organization_id,
    p_actor_user_id,
    p_owner_contact_name,
    p_owner_contact_email
  );
$function$;

revoke all on function public.purge_organization(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.purge_organization(uuid, uuid, text, text) to service_role;
