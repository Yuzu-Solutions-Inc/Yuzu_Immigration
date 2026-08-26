-- Public booking settings are per staff member (link, timezone, window, opt-in).
-- Existing org rows keep their token and are assigned to the default host,
-- else the first person with open hours, else the first licensed member.

alter table public.booking_settings
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

update public.booking_settings s
set user_id = coalesce(
  s.default_host_user_id,
  (
    select r.user_id
    from public.booking_availability_rules r
    where r.organization_id = s.organization_id
    order by r.created_at
    limit 1
  ),
  (
    select m.user_id
    from public.organization_members m
    where m.organization_id = s.organization_id
    order by
      case m.role::text
        when 'owner' then 0
        when 'admin' then 1
        else 2
      end,
      m.created_at
    limit 1
  )
)
where s.user_id is null;

delete from public.booking_settings
where user_id is null;

alter table public.booking_settings
  alter column user_id set not null;

alter table public.booking_settings
  drop constraint if exists booking_settings_organization_id_key;

alter table public.booking_settings
  drop constraint if exists booking_settings_organization_id_user_id_key;

alter table public.booking_settings
  add constraint booking_settings_organization_id_user_id_key
  unique (organization_id, user_id);

create index if not exists booking_settings_user_id_idx
  on public.booking_settings (user_id);

drop policy if exists booking_settings_select on public.booking_settings;
drop policy if exists booking_settings_insert on public.booking_settings;
drop policy if exists booking_settings_update on public.booking_settings;

create policy booking_settings_select
  on public.booking_settings for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_settings_insert
  on public.booking_settings for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy booking_settings_update
  on public.booking_settings for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

drop index if exists booking_settings_default_host_user_id_idx;

alter table public.booking_settings
  drop column if exists default_host_user_id;

comment on table public.booking_settings is
  'Per-staff public booking page. Token is hashed; plaintext is org-DEK encrypted for recopy.';
