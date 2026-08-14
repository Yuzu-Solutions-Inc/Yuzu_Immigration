-- One Google Calendar connection per staff user (was one per firm).
-- Public bookings are assigned to booking_settings.default_host_user_id.

alter table public.google_calendar_connections
  drop constraint if exists google_calendar_connections_organization_id_key;

alter table public.google_calendar_connections
  add constraint google_calendar_connections_org_user_uidx
  unique (organization_id, user_id);

create unique index if not exists google_calendar_connections_channel_id_uidx
  on public.google_calendar_connections (channel_id)
  where channel_id is not null;

comment on table public.google_calendar_connections is
  'One Google Calendar connection per staff user. OAuth tokens live in private.google_calendar_secrets.';

alter table public.booking_settings
  add column if not exists default_host_user_id uuid
  references public.profiles(id) on delete set null;

comment on column public.booking_settings.default_host_user_id is
  'Staff member who receives public bookings. Their Google busy times block public slots.';

create index if not exists booking_settings_default_host_user_id_idx
  on public.booking_settings (default_host_user_id);

alter table public.booking_appointments
  add column if not exists host_user_id uuid
  references public.profiles(id) on delete set null;

comment on column public.booking_appointments.host_user_id is
  'Staff member this booking is with. Google event is created on their connected calendar.';

create index if not exists booking_appointments_host_user_id_idx
  on public.booking_appointments (organization_id, host_user_id);

update public.booking_settings s
set default_host_user_id = c.user_id
from public.google_calendar_connections c
where c.organization_id = s.organization_id
  and s.default_host_user_id is null;

update public.booking_appointments a
set host_user_id = s.default_host_user_id
from public.booking_settings s
where a.organization_id = s.organization_id
  and a.host_user_id is null
  and s.default_host_user_id is not null;

drop policy if exists google_calendar_connections_insert on public.google_calendar_connections;
drop policy if exists google_calendar_connections_update on public.google_calendar_connections;
drop policy if exists google_calendar_connections_delete on public.google_calendar_connections;

create policy google_calendar_connections_insert
  on public.google_calendar_connections for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy google_calendar_connections_update
  on public.google_calendar_connections for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy google_calendar_connections_delete
  on public.google_calendar_connections for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );
