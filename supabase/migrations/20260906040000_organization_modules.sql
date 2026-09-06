-- Per-org Dossierly module flags (Finance, Immigration, Bookings, …).
-- Core (auth, shell, partners) is always on and is not stored here.

create table if not exists public.organization_modules (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module_id text not null,
  enabled_at timestamptz not null default now(),
  primary key (organization_id, module_id),
  constraint organization_modules_id_chk check (
    module_id in (
      'finance',
      'immigration',
      'bookings',
      'services',
      'contracts',
      'payments'
    )
  )
);

comment on table public.organization_modules is
  'Enabled Dossierly product modules per organization. Missing rows fall back in the app.';

alter table public.organization_modules enable row level security;

drop policy if exists organization_modules_select on public.organization_modules;
create policy organization_modules_select
  on public.organization_modules for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists organization_modules_insert on public.organization_modules;
create policy organization_modules_insert
  on public.organization_modules for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists organization_modules_update on public.organization_modules;
create policy organization_modules_update
  on public.organization_modules for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists organization_modules_delete on public.organization_modules;
create policy organization_modules_delete
  on public.organization_modules for delete to authenticated
  using (public.is_org_admin(organization_id));

grant select, insert, update, delete on public.organization_modules to authenticated;

-- Existing org on Yuzu Solutions Inc.: Finance pack, not Immigration.
insert into public.organization_modules (organization_id, module_id)
select o.id, m.module_id
from public.organizations o
cross join (
  values
    ('finance'),
    ('bookings'),
    ('services'),
    ('contracts'),
    ('payments')
) as m (module_id)
on conflict do nothing;
