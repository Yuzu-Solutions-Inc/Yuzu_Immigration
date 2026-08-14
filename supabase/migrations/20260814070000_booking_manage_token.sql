alter table public.booking_appointments
  add column if not exists manage_token_hash text;

create unique index if not exists booking_appointments_manage_token_hash_uidx
  on public.booking_appointments (manage_token_hash);

comment on column public.booking_appointments.manage_token_hash is
  'SHA-256 hex of the guest manage/cancel token. Store the hash only; never persist the plaintext token.';
