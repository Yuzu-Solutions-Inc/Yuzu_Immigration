-- Square OAuth (per org) + payment requests for bookings and project invoices.

alter type public.booking_appointment_status add value if not exists 'pending_payment';

create type public.payment_status as enum (
  'pending',
  'paid',
  'failed',
  'cancelled',
  'expired'
);

create type public.payment_source as enum (
  'booking',
  'project'
);

create table public.square_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  merchant_id text not null,
  location_id text not null,
  currency text not null default 'CAD',
  business_name text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.square_connections is
  'One Square seller connection per firm. OAuth tokens live in private.square_secrets.';

create table private.square_secrets (
  connection_id uuid primary key references public.square_connections(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.square_secrets enable row level security;

grant select, insert, update, delete on private.square_secrets to service_role;
revoke all on private.square_secrets from public, anon, authenticated;

create or replace function public.get_square_secrets(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row private.square_secrets;
begin
  select * into v_row
  from private.square_secrets s
  where s.connection_id = p_connection_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'access_token_encrypted', v_row.access_token_encrypted,
    'refresh_token_encrypted', v_row.refresh_token_encrypted,
    'access_token_expires_at', v_row.access_token_expires_at
  );
end;
$$;

create or replace function public.upsert_square_secrets(
  p_connection_id uuid,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_access_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into private.square_secrets (
    connection_id,
    access_token_encrypted,
    refresh_token_encrypted,
    access_token_expires_at,
    updated_at
  ) values (
    p_connection_id,
    p_access_token_encrypted,
    p_refresh_token_encrypted,
    p_access_token_expires_at,
    now()
  )
  on conflict (connection_id) do update set
    access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    access_token_expires_at = excluded.access_token_expires_at,
    updated_at = now();
end;
$$;

create or replace function public.patch_square_secrets(
  p_connection_id uuid,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update private.square_secrets
  set
    access_token_encrypted = coalesce(p_access_token_encrypted, access_token_encrypted),
    access_token_expires_at = coalesce(p_access_token_expires_at, access_token_expires_at),
    updated_at = now()
  where connection_id = p_connection_id;
end;
$$;

revoke all on function public.get_square_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_square_secrets(uuid) to service_role;

revoke all on function public.upsert_square_secrets(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_square_secrets(uuid, text, text, timestamptz) to service_role;

revoke all on function public.patch_square_secrets(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.patch_square_secrets(uuid, text, timestamptz) to service_role;

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source public.payment_source not null,
  status public.payment_status not null default 'pending',
  amount_cents integer not null,
  currency text not null default 'CAD',
  description text not null,
  project_id uuid references public.immigration_projects(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  appointment_id uuid references public.booking_appointments(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  token_hash text not null unique,
  token_encrypted text,
  square_payment_link_id text,
  square_order_id text,
  square_payment_id text,
  checkout_url text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_requests_amount_chk check (amount_cents > 0),
  constraint payment_requests_description_chk check (char_length(trim(description)) >= 1)
);

create unique index payment_requests_square_order_uidx
  on public.payment_requests (square_order_id)
  where square_order_id is not null;

create unique index payment_requests_appointment_uidx
  on public.payment_requests (appointment_id)
  where appointment_id is not null;

create index payment_requests_org_created_idx
  on public.payment_requests (organization_id, created_at desc);

create index payment_requests_project_idx
  on public.payment_requests (project_id, created_at desc)
  where project_id is not null;

alter table public.square_connections enable row level security;
alter table public.payment_requests enable row level security;

create policy square_connections_select
  on public.square_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy square_connections_insert
  on public.square_connections for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy square_connections_update
  on public.square_connections for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy square_connections_delete
  on public.square_connections for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy payment_requests_select
  on public.payment_requests for select to authenticated
  using (public.is_org_member(organization_id));

create policy payment_requests_insert
  on public.payment_requests for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy payment_requests_update
  on public.payment_requests for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy payment_requests_delete
  on public.payment_requests for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.square_connections to authenticated;
grant select, insert, update, delete on public.payment_requests to authenticated;
grant select, insert, update, delete on public.square_connections to service_role;
grant select, insert, update, delete on public.payment_requests to service_role;

grant usage on type public.payment_status to authenticated, service_role;
grant usage on type public.payment_source to authenticated, service_role;
