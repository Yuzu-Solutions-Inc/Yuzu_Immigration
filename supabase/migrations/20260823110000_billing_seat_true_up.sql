-- Opt-in unused-seat drop at renewal. Default off: licensed seats stay
-- until an admin releases them. Stripe quantity is unchanged mid-cycle.

alter table public.organizations
  add column if not exists billing_seat_true_up boolean not null default false;

comment on column public.organizations.billing_seat_true_up is
  'When true, unused paid staff seats are dropped on the renewal invoice. Mid-cycle adds still invoice immediately.';
