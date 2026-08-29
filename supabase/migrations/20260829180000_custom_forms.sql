-- Custom intake forms: org catalog + project snapshots, separate from IRCC PDFs.

alter table public.immigration_projects
  add column if not exists custom_form_percent integer not null default 0;

comment on column public.immigration_projects.custom_form_percent is
  'Completeness of attached custom intake forms (visible required fields).';

alter table public.organization_programs
  add column if not exists custom_forms jsonb not null default '[]'::jsonb;

alter table public.organization_programs
  drop constraint if exists organization_programs_custom_forms_chk;

alter table public.organization_programs
  add constraint organization_programs_custom_forms_chk
    check (jsonb_typeof(custom_forms) = 'array');

comment on column public.organization_programs.custom_forms is
  'Array of {templateId, scope: person|project, isRequired, sortOrder}. Snapshotted onto projects at create.';

create table public.custom_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  schema jsonb not null default '{"version":1,"sections":[]}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_form_templates_title_chk
    check (char_length(trim(title)) between 1 and 120),
  constraint custom_form_templates_description_chk
    check (description is null or char_length(description) <= 500),
  constraint custom_form_templates_schema_chk
    check (jsonb_typeof(schema) = 'object')
);

comment on table public.custom_form_templates is
  'Firm-built intake questionnaires. Schema is snapshotted onto projects at attach; later edits do not mutate in-flight files.';

create index custom_form_templates_org_idx
  on public.custom_form_templates (organization_id, is_active, updated_at desc);

create table public.project_custom_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  template_id uuid references public.custom_form_templates(id) on delete set null,
  title text not null,
  schema jsonb not null,
  scope text not null default 'person',
  person_id uuid references public.people(id) on delete cascade,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  status public.project_form_status not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_custom_forms_title_chk
    check (char_length(trim(title)) between 1 and 120),
  constraint project_custom_forms_scope_chk
    check (scope in ('person', 'project')),
  constraint project_custom_forms_schema_chk
    check (jsonb_typeof(schema) = 'object'),
  constraint project_custom_forms_person_scope_chk
    check (
      (scope = 'person' and person_id is not null)
      or (scope = 'project' and person_id is null)
    )
);

comment on table public.project_custom_forms is
  'Custom form instance on a file. schema is a frozen snapshot of the catalog template.';

create unique index project_custom_forms_person_uidx
  on public.project_custom_forms (project_id, template_id, person_id)
  where template_id is not null and person_id is not null;

create unique index project_custom_forms_project_uidx
  on public.project_custom_forms (project_id, template_id)
  where template_id is not null and person_id is null;

create index project_custom_forms_project_idx
  on public.project_custom_forms (project_id, sort_order);

create index project_custom_forms_org_idx
  on public.project_custom_forms (organization_id);

create table public.project_custom_form_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  current_section text,
  questionnaire_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_custom_form_answers_project_uidx unique (project_id)
);

comment on table public.project_custom_form_answers is
  'Org-DEK encrypted custom-form answers. Shape: { byPerson, project }. Separate from IRCC project_form_answers.';

create index project_custom_form_answers_org_idx
  on public.project_custom_form_answers (organization_id);

alter table public.custom_form_templates enable row level security;
alter table public.project_custom_forms enable row level security;
alter table public.project_custom_form_answers enable row level security;

create policy custom_form_templates_select
  on public.custom_form_templates for select to authenticated
  using (public.is_org_member(organization_id));

create policy custom_form_templates_insert
  on public.custom_form_templates for insert to authenticated
  with check (public.is_org_licensed(organization_id));

create policy custom_form_templates_update
  on public.custom_form_templates for update to authenticated
  using (public.is_org_licensed(organization_id))
  with check (public.is_org_licensed(organization_id));

create policy custom_form_templates_delete
  on public.custom_form_templates for delete to authenticated
  using (public.is_org_licensed(organization_id));

create policy project_custom_forms_select
  on public.project_custom_forms for select to authenticated
  using (public.can_access_project(project_id));

create policy project_custom_forms_insert
  on public.project_custom_forms for insert to authenticated
  with check (
    public.can_access_project(project_id)
    and public.is_org_licensed(organization_id)
  );

create policy project_custom_forms_update
  on public.project_custom_forms for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_custom_forms_delete
  on public.project_custom_forms for delete to authenticated
  using (
    public.can_access_project(project_id)
    and public.is_org_licensed(organization_id)
  );

create policy project_custom_form_answers_select
  on public.project_custom_form_answers for select to authenticated
  using (public.can_access_project(project_id));

create policy project_custom_form_answers_insert
  on public.project_custom_form_answers for insert to authenticated
  with check (public.can_access_project(project_id));

create policy project_custom_form_answers_update
  on public.project_custom_form_answers for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_custom_form_answers_delete
  on public.project_custom_form_answers for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.custom_form_templates
  to authenticated;
grant select, insert, update, delete on public.custom_form_templates
  to service_role;
grant select, insert, update, delete on public.project_custom_forms
  to authenticated;
grant select, insert, update, delete on public.project_custom_forms
  to service_role;
grant select, insert, update, delete on public.project_custom_form_answers
  to authenticated;
grant select, insert, update, delete on public.project_custom_form_answers
  to service_role;

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
  delete from public.project_custom_form_answers where organization_id = p_organization_id;
  delete from public.project_custom_forms where organization_id = p_organization_id;
  delete from public.custom_form_templates where organization_id = p_organization_id;
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
