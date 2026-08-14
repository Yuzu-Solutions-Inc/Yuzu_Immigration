create table public.booking_service_email_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete cascade,
  subject text not null,
  body text not null,
  days_before integer not null default 1,
  recipients text[] not null default array['{{customer_email}}'::text],
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_service_email_automations_subject_chk
    check (char_length(trim(subject)) between 1 and 200),
  constraint booking_service_email_automations_body_chk
    check (char_length(trim(body)) between 1 and 8000),
  constraint booking_service_email_automations_days_chk
    check (days_before between 0 and 90),
  constraint booking_service_email_automations_recipients_chk
    check (cardinality(recipients) between 1 and 10)
);

comment on table public.booking_service_email_automations is
  'Per-service reminder emails sent N calendar days before a confirmed appointment.';

comment on column public.booking_service_email_automations.recipients is
  'Resolved at send time. {{customer_email}} and {{consultant_email}} are allowed alongside extra addresses.';

create index booking_service_email_automations_org_idx
  on public.booking_service_email_automations (organization_id);

create index booking_service_email_automations_service_idx
  on public.booking_service_email_automations (service_id, is_enabled);

create table public.booking_automation_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_id uuid not null references public.booking_service_email_automations(id) on delete cascade,
  appointment_id uuid not null references public.booking_appointments(id) on delete cascade,
  appointment_starts_at timestamptz not null,
  sent_at timestamptz not null default now()
);

comment on table public.booking_automation_sends is
  'Dedupes automation emails. Rescheduling (new starts_at) allows a new send.';

create unique index booking_automation_sends_once_uidx
  on public.booking_automation_sends (automation_id, appointment_id, appointment_starts_at);

create index booking_automation_sends_org_idx
  on public.booking_automation_sends (organization_id);

create index booking_automation_sends_appointment_idx
  on public.booking_automation_sends (appointment_id);

alter table public.booking_service_email_automations enable row level security;
alter table public.booking_automation_sends enable row level security;

create policy booking_service_email_automations_select
  on public.booking_service_email_automations for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_service_email_automations_insert
  on public.booking_service_email_automations for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_service_email_automations_update
  on public.booking_service_email_automations for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_service_email_automations_delete
  on public.booking_service_email_automations for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_automation_sends_select
  on public.booking_automation_sends for select to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, update, delete on public.booking_service_email_automations to authenticated;
grant select, insert, update, delete on public.booking_service_email_automations to service_role;

grant select on public.booking_automation_sends to authenticated;
grant select, insert, update, delete on public.booking_automation_sends to service_role;
