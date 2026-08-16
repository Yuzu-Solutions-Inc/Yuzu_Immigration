-- Per-staff choice of calendar provider vs meeting provider (can differ).
-- conference_id stores a standalone Meet space or Teams online-meeting id.

alter table public.booking_appointments
  add column if not exists conference_id text;

comment on column public.booking_appointments.conference_id is
  'Standalone Google Meet space name or Teams online meeting id when the meeting vendor is not the calendar vendor.';

create table public.staff_booking_integrations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  calendar_provider text
    check (calendar_provider is null or calendar_provider in ('google', 'microsoft')),
  meeting_provider text
    check (meeting_provider is null or meeting_provider in ('google_meet', 'teams')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

comment on table public.staff_booking_integrations is
  'Which calendar and which meeting tool each staff member uses for bookings. OAuth tokens stay on the vendor connection tables.';

create index staff_booking_integrations_calendar_idx
  on public.staff_booking_integrations (organization_id, calendar_provider)
  where calendar_provider is not null;

alter table public.staff_booking_integrations enable row level security;

create policy staff_booking_integrations_select
  on public.staff_booking_integrations for select to authenticated
  using (public.is_org_member(organization_id));

create policy staff_booking_integrations_insert
  on public.staff_booking_integrations for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy staff_booking_integrations_update
  on public.staff_booking_integrations for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy staff_booking_integrations_delete
  on public.staff_booking_integrations for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

grant select, insert, update, delete on public.staff_booking_integrations to authenticated;
grant select, insert, update, delete on public.staff_booking_integrations to service_role;

-- Existing Google connections keep current behavior (calendar + Meet).
insert into public.staff_booking_integrations (
  organization_id,
  user_id,
  calendar_provider,
  meeting_provider
)
select
  c.organization_id,
  c.user_id,
  'google',
  'google_meet'
from public.google_calendar_connections c
where c.is_enabled
on conflict (organization_id, user_id) do nothing;

-- Outlook-only staff get Outlook + Teams.
insert into public.staff_booking_integrations (
  organization_id,
  user_id,
  calendar_provider,
  meeting_provider
)
select
  c.organization_id,
  c.user_id,
  'microsoft',
  'teams'
from public.microsoft_calendar_connections c
where c.is_enabled
on conflict (organization_id, user_id) do nothing;
