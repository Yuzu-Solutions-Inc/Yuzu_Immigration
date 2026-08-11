-- MyConsultant baseline RLS (apply after drizzle push / migrations)
-- Firm membership gates all tenant data. Tighten roles as features land.

alter table firms enable row level security;
alter table profiles enable row level security;
alter table firm_memberships enable row level security;
alter table clients enable row level security;
alter table cases enable row level security;

-- Profiles: users can read/update themselves
create policy "profiles_select_own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on profiles for update
  using (auth.uid() = id);

-- Memberships: visible to members of the same firm
create policy "memberships_select_same_firm"
  on firm_memberships for select
  using (
    exists (
      select 1 from firm_memberships mine
      where mine.user_id = auth.uid()
        and mine.firm_id = firm_memberships.firm_id
    )
  );

-- Firms: members only
create policy "firms_select_member"
  on firms for select
  using (
    exists (
      select 1 from firm_memberships m
      where m.firm_id = firms.id and m.user_id = auth.uid()
    )
  );

-- Clients / cases: firm members only
create policy "clients_all_member"
  on clients for all
  using (
    exists (
      select 1 from firm_memberships m
      where m.firm_id = clients.firm_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from firm_memberships m
      where m.firm_id = clients.firm_id and m.user_id = auth.uid()
    )
  );

create policy "cases_all_member"
  on cases for all
  using (
    exists (
      select 1 from firm_memberships m
      where m.firm_id = cases.firm_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from firm_memberships m
      where m.firm_id = cases.firm_id and m.user_id = auth.uid()
    )
  );
