-- Public booking is opt-in. New firms mint a settings row when they add
-- hours or services; that page must stay closed until they turn it on.

alter table public.booking_settings
  alter column is_enabled set default false;
