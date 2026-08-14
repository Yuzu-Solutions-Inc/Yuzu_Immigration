-- Independent calendars: each staff member has their own hours, blocked
-- days, and bookings. Overlap is enforced per host, not across the firm.

alter table public.booking_availability_rules
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

alter table public.booking_blocked_times
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

-- Backfill owner: default public-booking host, else earliest org member.
update public.booking_availability_rules r
set user_id = coalesce(
  (
    select s.default_host_user_id
    from public.booking_settings s
    where s.organization_id = r.organization_id
  ),
  (
    select m.user_id
    from public.organization_members m
    where m.organization_id = r.organization_id
    order by m.created_at
    limit 1
  )
)
where r.user_id is null;

update public.booking_blocked_times b
set user_id = coalesce(
  b.created_by,
  (
    select s.default_host_user_id
    from public.booking_settings s
    where s.organization_id = b.organization_id
  ),
  (
    select m.user_id
    from public.organization_members m
    where m.organization_id = b.organization_id
    order by m.created_at
    limit 1
  )
)
where b.user_id is null;

update public.booking_appointments a
set host_user_id = coalesce(
  a.host_user_id,
  (
    select s.default_host_user_id
    from public.booking_settings s
    where s.organization_id = a.organization_id
  ),
  (
    select m.user_id
    from public.organization_members m
    where m.organization_id = a.organization_id
    order by m.created_at
    limit 1
  )
)
where a.host_user_id is null;

delete from public.booking_availability_rules where user_id is null;
delete from public.booking_blocked_times where user_id is null;
delete from public.booking_appointments where host_user_id is null;

alter table public.booking_availability_rules
  alter column user_id set not null;

alter table public.booking_blocked_times
  alter column user_id set not null;

alter table public.booking_appointments
  alter column host_user_id set not null;

alter table public.booking_availability_rules
  drop constraint if exists booking_availability_unique;

alter table public.booking_availability_rules
  add constraint booking_availability_unique
  unique (organization_id, user_id, weekday, start_time, end_time);

create index if not exists booking_availability_rules_user_idx
  on public.booking_availability_rules (organization_id, user_id, weekday);

create index if not exists booking_blocked_times_user_range_idx
  on public.booking_blocked_times (organization_id, user_id, starts_at, ends_at);

comment on table public.booking_availability_rules is
  'Per-staff recurring weekly open hours in the organization timezone. weekday 0 = Sunday.';

comment on column public.booking_blocked_times.user_id is
  'Staff member whose public calendar this block applies to.';

comment on column public.booking_appointments.host_user_id is
  'Staff member this booking is with. Overlap is enforced per host.';

alter table public.booking_appointments
  drop constraint if exists booking_appointments_no_overlap;

alter table public.booking_appointments
  add constraint booking_appointments_no_overlap
  exclude using gist (
    organization_id with =,
    host_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'confirmed');

drop policy if exists booking_availability_insert on public.booking_availability_rules;
drop policy if exists booking_availability_update on public.booking_availability_rules;
drop policy if exists booking_availability_delete on public.booking_availability_rules;

create policy booking_availability_insert
  on public.booking_availability_rules for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy booking_availability_update
  on public.booking_availability_rules for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy booking_availability_delete
  on public.booking_availability_rules for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

drop policy if exists booking_blocked_insert on public.booking_blocked_times;
drop policy if exists booking_blocked_delete on public.booking_blocked_times;

create policy booking_blocked_insert
  on public.booking_blocked_times for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy booking_blocked_delete
  on public.booking_blocked_times for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );
