-- INSERT ... RETURNING applies SELECT policies to the new row (Postgres 15+).
-- can_access_person(id) / can_access_project(id) are STABLE and look up the
-- same table, so they cannot see the row being inserted and RETURNING fails
-- with "new row violates row-level security policy".
-- Full-access staff can use organization_id on the new row directly.

drop policy if exists people_insert_staff on public.people;
create policy people_insert_staff
  on public.people for insert to authenticated
  with check ((select public.is_org_full_access(organization_id)));

drop policy if exists people_select_access on public.people;
create policy people_select_access
  on public.people for select to authenticated
  using (
    (select public.is_org_full_access(organization_id))
    or public.can_access_person(id)
  );

drop policy if exists immigration_projects_select_access on public.immigration_projects;
create policy immigration_projects_select_access
  on public.immigration_projects for select to authenticated
  using (
    (select public.is_org_full_access(organization_id))
    or public.can_access_project(id)
  );
