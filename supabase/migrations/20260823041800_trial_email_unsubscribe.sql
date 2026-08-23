-- Staff opt-out from the 30-day trial email sequence. Does not suppress
-- transactional mail (bookings, portal, password reset). Service-role writes
-- the timestamp from a signed public link.

alter table public.profiles
  add column if not exists trial_email_unsubscribed_at timestamptz;

comment on column public.profiles.trial_email_unsubscribed_at is
  'When the staff user unsubscribed from Permit OS trial emails.';
