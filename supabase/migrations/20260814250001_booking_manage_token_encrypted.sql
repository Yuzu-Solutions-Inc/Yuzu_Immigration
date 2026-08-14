-- Allow confirmation emails after Square payment using the encrypted manage token.
alter table public.booking_appointments
  add column if not exists manage_token_encrypted text;

comment on column public.booking_appointments.manage_token_encrypted is
  'Org-DEK encrypted manage token so post-payment emails can include manage/cancel links.';
