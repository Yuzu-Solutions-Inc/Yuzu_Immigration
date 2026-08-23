-- Stripe Billing for Permit OS subscriptions. Staff cannot set these
-- (trial lock still blocks authenticated UPDATEs on organizations).
-- Webhooks and checkout write via service_role.

alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_plan text,
  add column if not exists billing_interval text,
  add column if not exists billing_seat_quantity integer not null default 1,
  add column if not exists founding_rate boolean not null default false;

create unique index if not exists organizations_stripe_customer_uidx
  on public.organizations (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.organizations.stripe_customer_id is
  'Stripe Customer for this firm. Written by service_role.';
comment on column public.organizations.stripe_subscription_id is
  'Current Stripe Subscription id, if any.';
comment on column public.organizations.billing_plan is
  'standard or team, mirrored from Stripe.';
comment on column public.organizations.billing_interval is
  'month or year, mirrored from Stripe.';
comment on column public.organizations.billing_seat_quantity is
  'Paid staff seats (included plan seats plus extra seats).';
comment on column public.organizations.founding_rate is
  'True when this firm locked in founding prices (first 100 paid firms).';
