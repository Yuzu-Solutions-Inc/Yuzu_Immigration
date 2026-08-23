-- Stripe Connect (one processor per firm). Disabled Square/Stripe rows stay so
-- existing payment links keep working until payment_requests.expires_at.

create type public.payment_processor as enum ('square', 'stripe');

alter table public.payment_requests
  add column processor public.payment_processor not null default 'square',
  add column stripe_account_id text,
  add column stripe_checkout_session_id text,
  add column stripe_payment_intent_id text,
  add column stripe_refund_id text;

create unique index payment_requests_stripe_session_uidx
  on public.payment_requests (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create table public.stripe_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  stripe_account_id text not null unique,
  currency text not null default 'CAD',
  business_name text,
  charges_ready boolean not null default false,
  payouts_ready boolean not null default false,
  details_submitted boolean not null default false,
  is_enabled boolean not null default true,
  cancel_refund_enabled boolean not null default true,
  cancel_free_days_before integer not null default 10,
  cancel_min_days_before integer not null default 2,
  cancel_refund_fee_type text not null default 'percent',
  cancel_refund_fee_cents integer not null default 0,
  cancel_refund_fee_percent integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_connections is
  'One Stripe connected account per firm. Direct charges; platform takes no application fee. is_enabled false keeps the account for outstanding payment links.';

alter table public.stripe_connections enable row level security;

create policy stripe_connections_select
  on public.stripe_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy stripe_connections_insert
  on public.stripe_connections for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy stripe_connections_update
  on public.stripe_connections for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy stripe_connections_delete
  on public.stripe_connections for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.stripe_connections to authenticated;
grant select, insert, update, delete on public.stripe_connections to service_role;
grant usage on type public.payment_processor to authenticated, service_role;

create or replace function public.sync_exclusive_payment_processor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_enabled then
    if tg_table_name = 'square_connections' then
      update public.stripe_connections
      set is_enabled = false, updated_at = now()
      where organization_id = new.organization_id
        and is_enabled = true;
    elsif tg_table_name = 'stripe_connections' then
      update public.square_connections
      set is_enabled = false, updated_at = now()
      where organization_id = new.organization_id
        and is_enabled = true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists square_exclusive_payment_processor on public.square_connections;
create trigger square_exclusive_payment_processor
  after insert or update of is_enabled on public.square_connections
  for each row
  execute function public.sync_exclusive_payment_processor();

drop trigger if exists stripe_exclusive_payment_processor on public.stripe_connections;
create trigger stripe_exclusive_payment_processor
  after insert or update of is_enabled on public.stripe_connections
  for each row
  execute function public.sync_exclusive_payment_processor();
