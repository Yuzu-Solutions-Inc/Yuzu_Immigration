-- Standard trial: 30 days from trial_started_at. Existing firms get a fresh
-- window at migrate time (NOT NULL DEFAULT now() fills current rows).
-- subscribed_at is set only by service_role when paid billing starts.
-- Authenticated staff writes freeze after the trial unless subscribed.
-- Data is kept. Reads stay allowed. service_role (cron, webhooks, portal
-- service paths) is not blocked.

alter table public.organizations
  add column if not exists subscribed_at timestamptz,
  add column if not exists trial_started_at timestamptz not null default now();

comment on column public.organizations.subscribed_at is
  'When paid billing began. Null means the firm is on the Standard trial.';
comment on column public.organizations.trial_started_at is
  'Start of the 30-day Standard trial.';

create or replace function public.org_allows_writes(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and (
        o.subscribed_at is not null
        or o.trial_started_at + interval '30 days' > now()
      )
  );
$$;

revoke all on function public.org_allows_writes(uuid) from public;
grant execute on function public.org_allows_writes(uuid) to authenticated;
grant execute on function public.org_allows_writes(uuid) to service_role;

create or replace function public.reject_writes_when_trial_expired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oid uuid;
begin
  if auth.role() is distinct from 'authenticated' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'organizations' then
    oid := coalesce(new.id, old.id);
    if tg_op = 'UPDATE' and (
      new.subscribed_at is distinct from old.subscribed_at
      or new.trial_started_at is distinct from old.trial_started_at
    ) then
      raise exception 'forbidden'
        using errcode = '42501';
    end if;
  else
    oid := coalesce(new.organization_id, old.organization_id);
  end if;

  if oid is not null and not public.org_allows_writes(oid) then
    raise exception 'trial_expired'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.attname = 'organization_id'
      and c.relname <> 'staff_notifications'
  loop
    execute format(
      'drop trigger if exists trg_trial_lock on public.%I',
      r.table_name
    );
    execute format(
      'create trigger trg_trial_lock
         before insert or update or delete on public.%I
         for each row execute function public.reject_writes_when_trial_expired()',
      r.table_name
    );
  end loop;

  drop trigger if exists trg_trial_lock on public.organizations;
  create trigger trg_trial_lock
    before update or delete on public.organizations
    for each row execute function public.reject_writes_when_trial_expired();
end;
$$;
