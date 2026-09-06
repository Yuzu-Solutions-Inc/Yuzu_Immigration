-- Additive family-CRM compatibility on Yuzu Solutions Inc.
-- Snapshot before this migration (pg_stat_user_tables, 2026-09-06):
--   time_entry_lines 110, organization_modules 5, organizations 1, profiles 1,
--   organization_members 1; remaining finance tables 0. Auth users: 1.
-- Do not drop tables, storage objects, or auth.users.

-- ---------------------------------------------------------------------------
-- Organizations: Dossierly columns (nullable / defaulted). Keep existing rows.
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists wrapped_dek text,
  add column if not exists privacy_contact_email text,
  add column if not exists portal_google_login_enabled boolean not null default false,
  add column if not exists dpa_accepted_at timestamptz,
  add column if not exists dpa_version text,
  add column if not exists dpa_accepted_by uuid,
  add column if not exists inbound_local_part text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists subscribed_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_plan text,
  add column if not exists billing_interval text,
  add column if not exists billing_seat_quantity integer not null default 1,
  add column if not exists billing_seat_true_up boolean not null default false,
  add column if not exists billing_pending_seat_quantity integer,
  add column if not exists billing_pending_interval text,
  add column if not exists billing_pending_effective_at timestamptz,
  add column if not exists stripe_subscription_schedule_id text,
  add column if not exists founding_rate boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists owner_contact_name text,
  add column if not exists owner_contact_email text;

create or replace function public.generate_inbound_local_part(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  loop
    v_token := p_prefix || encode(extensions.gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1 from public.organizations o where o.inbound_local_part = v_token
    );
  end loop;
  return v_token;
end;
$$;

revoke all on function public.generate_inbound_local_part(text) from public, anon, authenticated;
grant execute on function public.generate_inbound_local_part(text) to service_role;

update public.organizations
set inbound_local_part = public.generate_inbound_local_part('o_')
where inbound_local_part is null;

update public.organizations
set trial_started_at = created_at
where trial_started_at is null;

-- Existing operating firm: do not lock writes behind a new 30-day trial.
update public.organizations
set subscribed_at = created_at
where subscribed_at is null;

alter table public.organizations
  alter column inbound_local_part set not null,
  alter column trial_started_at set default now(),
  alter column trial_started_at set not null;

create unique index if not exists organizations_inbound_local_part_uidx
  on public.organizations (inbound_local_part);

alter table public.organizations drop constraint if exists organizations_inbound_local_part_format;
alter table public.organizations
  add constraint organizations_inbound_local_part_format
  check (inbound_local_part ~ '^o_[0-9a-f]{24}$');

create or replace function public.organizations_set_inbound_local_part()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inbound_local_part is null or btrim(new.inbound_local_part) = '' then
    new.inbound_local_part := public.generate_inbound_local_part('o_');
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_inbound_local_part_bi on public.organizations;
create trigger organizations_inbound_local_part_bi
  before insert on public.organizations
  for each row execute function public.organizations_set_inbound_local_part();

-- ---------------------------------------------------------------------------
-- Memberships: licensed seats. `member` stays in the enum; app maps it to
-- case_manager. Enum value `case_manager` is added in a prior statement.
-- ---------------------------------------------------------------------------

alter table public.organization_members
  add column if not exists is_licensed boolean not null default true,
  add column if not exists licensed_at_renewal boolean;

alter table public.organization_invitations
  add column if not exists is_licensed boolean not null default true;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists trial_email_unsubscribed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Partners + invoice AR Stripe identity
-- ---------------------------------------------------------------------------

alter table public.partners
  add column if not exists phone text;

alter table public.payments
  add column if not exists source text not null default 'other',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

alter table public.payments drop constraint if exists payments_source_chk;
alter table public.payments
  add constraint payments_source_chk
  check (source in ('stripe', 'bank', 'other', 'manual'));

create unique index if not exists payments_stripe_checkout_session_uidx
  on public.payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- ---------------------------------------------------------------------------
-- Dossierly create_organization(name, slug, actor) overload.
-- Finance's create_organization(text) stays.
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_actor_user_id uuid
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  insert into public.profiles (id, email)
  select p_actor_user_id, u.email from auth.users u where u.id = p_actor_user_id
  on conflict (id) do nothing;

  if not exists (select 1 from public.profiles p where p.id = p_actor_user_id) then
    raise exception 'Profile missing for user';
  end if;

  perform pg_advisory_xact_lock(87223023);

  insert into public.organizations (name, slug, founding_rate, default_locale)
  values (
    trim(p_name),
    lower(trim(p_slug)),
    (select count(*) from public.organizations) < 100,
    'fr'
  )
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role, is_licensed)
  values (v_org.id, p_actor_user_id, 'owner', true);

  insert into public.organization_settings (organization_id, user_id)
  values (v_org.id, p_actor_user_id)
  on conflict (organization_id) do nothing;

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, uuid) to service_role;
