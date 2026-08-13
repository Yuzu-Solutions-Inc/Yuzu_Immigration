-- Firm booking calendar: services, recurring availability, appointments.
create extension if not exists btree_gist with schema extensions;

create type public.booking_appointment_status as enum (
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

create table public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  public_token_hash text not null unique,
  public_token_encrypted text,
  timezone text not null default 'America/Toronto',
  booking_window_days integer not null default 14,
  min_notice_hours integer not null default 24,
  buffer_minutes integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_settings_window_days_chk
    check (booking_window_days between 1 and 90),
  constraint booking_settings_min_notice_chk
    check (min_notice_hours between 0 and 168),
  constraint booking_settings_buffer_chk
    check (buffer_minutes between 0 and 120)
);

comment on table public.booking_settings is
  'Per-org booking page settings. Public token is hashed; plaintext is org-DEK encrypted for recopy.';

create table public.booking_availability_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint booking_availability_weekday_chk check (weekday between 0 and 6),
  constraint booking_availability_range_chk check (end_time > start_time),
  constraint booking_availability_unique unique (organization_id, weekday, start_time, end_time)
);

comment on table public.booking_availability_rules is
  'Recurring weekly open hours in the organization timezone. weekday 0 = Sunday.';

create table public.booking_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  duration_minutes integer not null,
  price_cents integer not null default 0,
  currency text not null default 'CAD',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_services_title_chk check (char_length(trim(title)) >= 1),
  constraint booking_services_duration_chk check (duration_minutes between 5 and 480),
  constraint booking_services_price_chk check (price_cents >= 0)
);

create table public.booking_blocked_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint booking_blocked_times_range_chk check (ends_at > starts_at)
);

create table public.booking_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete restrict,
  person_id uuid references public.people(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  guest_name text not null,
  guest_email text not null,
  guest_phone text not null,
  guest_address text not null,
  privacy_accepted_at timestamptz not null,
  status public.booking_appointment_status not null default 'confirmed',
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_appointments_range_chk check (ends_at > starts_at)
);

comment on table public.booking_appointments is
  'Booked consultation slots. Guest PII is org-DEK encrypted at the application layer.';

create index booking_settings_organization_id_idx
  on public.booking_settings (organization_id);

create index booking_availability_rules_org_idx
  on public.booking_availability_rules (organization_id, weekday);

create index booking_services_org_idx
  on public.booking_services (organization_id, sort_order, created_at);

create index booking_blocked_times_org_range_idx
  on public.booking_blocked_times (organization_id, starts_at, ends_at);

create index booking_appointments_org_starts_idx
  on public.booking_appointments (organization_id, starts_at);

create index booking_appointments_service_id_idx
  on public.booking_appointments (service_id);

create index booking_appointments_person_id_idx
  on public.booking_appointments (person_id);

create index booking_appointments_cancelled_by_idx
  on public.booking_appointments (cancelled_by);

create index booking_blocked_times_created_by_idx
  on public.booking_blocked_times (created_by);

create index booking_appointments_confirmed_range_idx
  on public.booking_appointments (organization_id, starts_at, ends_at)
  where status = 'confirmed';

alter table public.booking_appointments
  add constraint booking_appointments_no_overlap
  exclude using gist (
    organization_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'confirmed');

alter table public.booking_settings enable row level security;
alter table public.booking_availability_rules enable row level security;
alter table public.booking_services enable row level security;
alter table public.booking_blocked_times enable row level security;
alter table public.booking_appointments enable row level security;

-- All staff can view the firm calendar; admins/consultants manage it.
create policy booking_settings_select
  on public.booking_settings for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_settings_insert
  on public.booking_settings for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_settings_update
  on public.booking_settings for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_availability_select
  on public.booking_availability_rules for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_availability_insert
  on public.booking_availability_rules for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_availability_update
  on public.booking_availability_rules for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_availability_delete
  on public.booking_availability_rules for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_services_select
  on public.booking_services for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_services_insert
  on public.booking_services for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_services_update
  on public.booking_services for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_services_delete
  on public.booking_services for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_blocked_select
  on public.booking_blocked_times for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_blocked_insert
  on public.booking_blocked_times for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_blocked_delete
  on public.booking_blocked_times for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_appointments_select
  on public.booking_appointments for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_appointments_update
  on public.booking_appointments for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.booking_settings to authenticated;
grant select, insert, update, delete on public.booking_availability_rules to authenticated;
grant select, insert, update, delete on public.booking_services to authenticated;
grant select, insert, update, delete on public.booking_blocked_times to authenticated;
grant select, insert, update, delete on public.booking_appointments to authenticated;

grant select, insert, update, delete on public.booking_settings to service_role;
grant select, insert, update, delete on public.booking_availability_rules to service_role;
grant select, insert, update, delete on public.booking_services to service_role;
grant select, insert, update, delete on public.booking_blocked_times to service_role;
grant select, insert, update, delete on public.booking_appointments to service_role;

grant usage on type public.booking_appointment_status to authenticated, service_role;
