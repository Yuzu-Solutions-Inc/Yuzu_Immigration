-- Service reminder emails: up to 3 day-offsets, same shape as payment reminders.

alter table public.booking_automation_sends
  add column if not exists days_before integer;

update public.booking_automation_sends s
set days_before = a.days_before
from public.booking_service_email_automations a
where s.automation_id = a.id
  and s.days_before is null;

update public.booking_automation_sends
set days_before = 0
where days_before is null;

alter table public.booking_automation_sends
  alter column days_before set not null;

drop index if exists public.booking_automation_sends_once_uidx;

create unique index booking_automation_sends_once_uidx
  on public.booking_automation_sends (
    automation_id, appointment_id, days_before, appointment_starts_at
  );

alter table public.booking_service_email_automations
  drop constraint if exists booking_service_email_automations_days_chk;

alter table public.booking_service_email_automations
  alter column days_before drop default;

alter table public.booking_service_email_automations
  alter column days_before type integer[]
  using array[days_before]::integer[];

alter table public.booking_service_email_automations
  alter column days_before set default '{1}'::integer[];

alter table public.booking_service_email_automations
  add constraint booking_service_email_automations_days_chk
  check (cardinality(days_before) between 1 and 3);

comment on column public.booking_service_email_automations.days_before is
  'Up to 3 day-offsets before the appointment to send this reminder (e.g. {7,3,1}).';

comment on column public.booking_automation_sends.days_before is
  'Which days_before offset this send was for.';
