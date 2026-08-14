-- Replace Zoom meetings with Google Meet on calendar events.

drop function if exists public.get_zoom_secrets(uuid);
drop function if exists public.upsert_zoom_secrets(uuid, text, text, timestamptz);
drop function if exists public.patch_zoom_secrets(uuid, text, timestamptz, text);

drop table if exists private.zoom_secrets;
drop table if exists public.zoom_connections;

alter table public.booking_appointments
  drop column if exists zoom_meeting_id,
  drop column if exists zoom_join_url;

alter table public.booking_appointments
  add column if not exists meet_join_url text;

comment on column public.booking_appointments.meet_join_url is
  'Google Meet join URL from the host Google Calendar event. Null if Calendar is not connected.';
