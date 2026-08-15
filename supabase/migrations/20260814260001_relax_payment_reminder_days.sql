-- Relax payment reminder day values; app validates 0–90 and max 3 entries.
alter table public.booking_services
  drop constraint if exists booking_services_payment_reminder_days_chk;

alter table public.booking_services
  add constraint booking_services_payment_reminder_days_chk
  check (cardinality(payment_reminder_days) <= 3);
