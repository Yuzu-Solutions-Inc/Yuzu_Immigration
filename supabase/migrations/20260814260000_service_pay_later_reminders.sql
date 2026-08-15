-- Pay-later toggle + up to 3 payment reminder offsets (days before appointment).

alter table public.booking_services
  add column if not exists allow_pay_later boolean not null default false,
  add column if not exists payment_reminder_days integer[] not null default '{}'::integer[];

alter table public.booking_services
  drop constraint if exists booking_services_payment_reminder_days_chk;

alter table public.booking_services
  add constraint booking_services_payment_reminder_days_chk
  check (cardinality(payment_reminder_days) <= 3);

comment on column public.booking_services.allow_pay_later is
  'When true and price > 0, guests may book now and pay before the appointment.';
comment on column public.booking_services.payment_reminder_days is
  'Up to 3 day-offsets before the appointment to email unpaid guests (e.g. {7,3,1}).';

create table if not exists public.booking_payment_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.booking_appointments(id) on delete cascade,
  payment_request_id uuid not null references public.payment_requests(id) on delete cascade,
  days_before integer not null,
  appointment_starts_at timestamptz not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists booking_payment_reminder_sends_once_uidx
  on public.booking_payment_reminder_sends (
    appointment_id, days_before, appointment_starts_at
  );

create index if not exists booking_payment_reminder_sends_org_idx
  on public.booking_payment_reminder_sends (organization_id);

alter table public.booking_payment_reminder_sends enable row level security;

drop policy if exists booking_payment_reminder_sends_select
  on public.booking_payment_reminder_sends;

create policy booking_payment_reminder_sends_select
  on public.booking_payment_reminder_sends for select to authenticated
  using (public.is_org_member(organization_id));

grant select on public.booking_payment_reminder_sends to authenticated;
grant select, insert, update, delete on public.booking_payment_reminder_sends to service_role;
