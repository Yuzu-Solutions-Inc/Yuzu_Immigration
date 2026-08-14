-- Google Calendar two-way sync + appointment event ids.

alter table public.booking_appointments
  add column if not exists google_event_id text;

create unique index if not exists booking_appointments_google_event_id_uidx
  on public.booking_appointments (google_event_id)
  where google_event_id is not null;

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  channel_id text,
  channel_resource_id text,
  channel_expiration timestamptz,
  last_synced_at timestamptz,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_connections is
  'One Google Calendar connection per firm. OAuth tokens live in private.google_calendar_secrets.';

create table public.booking_google_busy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  google_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_google_busy_range_chk check (ends_at > starts_at),
  constraint booking_google_busy_event_unique unique (connection_id, google_event_id)
);

comment on table public.booking_google_busy is
  'Busy intervals mirrored from Google Calendar (external events, not our bookings).';

create index booking_google_busy_org_range_idx
  on public.booking_google_busy (organization_id, starts_at, ends_at);

create index google_calendar_connections_user_id_idx
  on public.google_calendar_connections (user_id);

create table private.google_calendar_secrets (
  connection_id uuid primary key references public.google_calendar_connections(id) on delete cascade,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  sync_token text,
  channel_token_encrypted text,
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
alter table public.booking_google_busy enable row level security;
alter table private.google_calendar_secrets enable row level security;

create policy google_calendar_connections_select
  on public.google_calendar_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy google_calendar_connections_insert
  on public.google_calendar_connections for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy google_calendar_connections_update
  on public.google_calendar_connections for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy google_calendar_connections_delete
  on public.google_calendar_connections for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_google_busy_select
  on public.booking_google_busy for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_google_busy_insert
  on public.booking_google_busy for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_google_busy_update
  on public.booking_google_busy for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_google_busy_delete
  on public.booking_google_busy for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.google_calendar_connections to authenticated;
grant select, insert, update, delete on public.booking_google_busy to authenticated;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant select, insert, update, delete on public.booking_google_busy to service_role;

grant select, insert, update, delete on private.google_calendar_secrets to service_role;
revoke all on private.google_calendar_secrets from public, anon, authenticated;
