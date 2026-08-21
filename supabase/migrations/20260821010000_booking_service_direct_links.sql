-- Standard + urgent service prices, and single-use booking links that
-- ignore weekly open hours (blocked calendar time still applies).

alter table public.booking_services
  add column if not exists urgent_price_cents integer,
  add column if not exists urgent_auto_within_days integer;

alter table public.booking_services
  drop constraint if exists booking_services_urgent_price_chk;

alter table public.booking_services
  add constraint booking_services_urgent_price_chk
  check (urgent_price_cents is null or urgent_price_cents >= 0);

alter table public.booking_services
  drop constraint if exists booking_services_urgent_auto_days_chk;

alter table public.booking_services
  add constraint booking_services_urgent_auto_days_chk
  check (
    urgent_auto_within_days is null
    or (urgent_auto_within_days >= 1 and urgent_auto_within_days <= 90)
  );

comment on column public.booking_services.urgent_price_cents is
  'Optional rush price. Null means urgent pricing is off.';
comment on column public.booking_services.urgent_auto_within_days is
  'When set with urgent_price_cents, bookings starting within this many days are charged the urgent price.';

create table public.booking_service_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  rate_kind text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  appointment_id uuid references public.booking_appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint booking_service_links_rate_kind_chk
    check (rate_kind in ('standard', 'urgent')),
  constraint booking_service_links_token_hash_uidx unique (token_hash)
);

comment on table public.booking_service_links is
  'Single-use service booking links. Hash-only token; row is deleted after expires_at (7 days). One appointment max.';

create index booking_service_links_org_idx
  on public.booking_service_links (organization_id, created_at desc);

create index booking_service_links_expires_idx
  on public.booking_service_links (expires_at);

create index booking_service_links_service_idx
  on public.booking_service_links (service_id);

alter table public.booking_service_links enable row level security;

create policy booking_service_links_select_access
  on public.booking_service_links for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_service_links_insert_access
  on public.booking_service_links for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy booking_service_links_update_access
  on public.booking_service_links for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy booking_service_links_delete_access
  on public.booking_service_links for delete to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, update, delete on public.booking_service_links
  to authenticated;
grant select, insert, update, delete on public.booking_service_links
  to service_role;
