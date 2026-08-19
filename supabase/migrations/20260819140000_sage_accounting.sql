-- Sage Business Cloud Accounting: org OAuth, tax mappings, client links,
-- and payment tax/invoice fields so Square and Sage charge the same tax.

alter table public.people
  add column if not exists sage_contact_id text,
  add column if not exists sage_has_main_address boolean not null default false,
  add column if not exists sage_address_country text,
  add column if not exists sage_address_region text;

create unique index if not exists people_org_sage_contact_uidx
  on public.people (organization_id, sage_contact_id)
  where sage_contact_id is not null;

comment on column public.people.sage_contact_id is
  'Sage Accounting customer contact id. Matched by email; name only disambiguates duplicates.';
comment on column public.people.sage_has_main_address is
  'True when the linked Sage contact has a main address usable for sales tax.';

create table public.sage_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  connected_by uuid references public.profiles(id) on delete set null,
  business_id text not null,
  business_name text,
  country_id text,
  currency text not null default 'CAD',
  customer_contact_type_id text,
  default_ledger_account_id text,
  default_ledger_account_name text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sage_connections is
  'One Sage Business Cloud Accounting connection per firm. OAuth tokens live in private.sage_secrets.';

create table public.sage_tax_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  country_code text not null,
  region_code text,
  sage_tax_rate_id text not null,
  sage_tax_rate_name text,
  percentage numeric(8, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sage_tax_mappings_country_chk check (char_length(country_code) = 2)
);

create unique index sage_tax_mappings_org_region_uidx
  on public.sage_tax_mappings (
    organization_id,
    country_code,
    coalesce(region_code, '')
  );

create index sage_tax_mappings_org_idx
  on public.sage_tax_mappings (organization_id);

create table private.sage_secrets (
  connection_id uuid primary key references public.sage_connections(id) on delete cascade,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.sage_secrets enable row level security;

grant select, insert, update, delete on private.sage_secrets to service_role;
revoke all on private.sage_secrets from public, anon, authenticated;

create or replace function public.get_sage_secrets(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row private.sage_secrets;
begin
  select * into v_row
  from private.sage_secrets s
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

create or replace function public.upsert_sage_secrets(
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
  insert into private.sage_secrets (
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

revoke all on function public.get_sage_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_sage_secrets(uuid) to service_role;

revoke all on function public.upsert_sage_secrets(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_sage_secrets(uuid, text, text, timestamptz) to service_role;

alter table public.payment_requests
  add column if not exists tax_cents integer not null default 0,
  add column if not exists tax_percent numeric(8, 4),
  add column if not exists tax_label text,
  add column if not exists tax_country text,
  add column if not exists tax_region text,
  add column if not exists sage_tax_rate_id text,
  add column if not exists sage_invoice_id text;

alter table public.payment_requests
  drop constraint if exists payment_requests_tax_cents_chk;
alter table public.payment_requests
  add constraint payment_requests_tax_cents_chk check (tax_cents >= 0);

alter table public.sage_connections enable row level security;
alter table public.sage_tax_mappings enable row level security;

create policy sage_connections_select
  on public.sage_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy sage_connections_insert
  on public.sage_connections for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy sage_connections_update
  on public.sage_connections for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy sage_connections_delete
  on public.sage_connections for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy sage_tax_mappings_select
  on public.sage_tax_mappings for select to authenticated
  using (public.is_org_member(organization_id));

create policy sage_tax_mappings_insert
  on public.sage_tax_mappings for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy sage_tax_mappings_update
  on public.sage_tax_mappings for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy sage_tax_mappings_delete
  on public.sage_tax_mappings for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.sage_connections to authenticated, service_role;
grant select, insert, update, delete on public.sage_tax_mappings to authenticated, service_role;
