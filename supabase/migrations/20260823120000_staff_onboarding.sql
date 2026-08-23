-- Per-member guided setup (admins and case managers).
-- A missing row means the welcome wizard has not been finished or dismissed.

create table public.staff_onboarding (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

comment on table public.staff_onboarding is
  'First-run welcome wizard per staff membership. Null timestamps mean the tour is still outstanding.';

alter table public.staff_onboarding enable row level security;

create policy staff_onboarding_select
  on public.staff_onboarding for select to authenticated
  using (public.is_org_member(organization_id));

create policy staff_onboarding_insert_own
  on public.staff_onboarding for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy staff_onboarding_update_own
  on public.staff_onboarding for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

grant select, insert, update on public.staff_onboarding to authenticated;
