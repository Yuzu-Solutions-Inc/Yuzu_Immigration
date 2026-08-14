alter table public.booking_google_busy
  add column if not exists summary text;

comment on column public.booking_google_busy.summary is
  'Google Calendar event title, mirrored for staff day view. Null until next sync.';
