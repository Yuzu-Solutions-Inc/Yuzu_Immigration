-- Microsoft 365 / Outlook Calendar two-way sync + Teams meetings on bookings.
-- Tokens live in private.microsoft_calendar_secrets (service_role RPCs only).

alter table public.booking_appointments
  add column if not exists microsoft_event_id text;

create unique index if not exists booking_appointments_microsoft_event_id_uidx
  on public.booking_appointments (microsoft_event_id)
  where microsoft_event_id is not null;

comment on column public.booking_appointments.microsoft_event_id is
  'Outlook/Microsoft Graph event id on the host’s connected calendar.';

create table public.microsoft_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  microsoft_email text,
  calendar_id text not null default 'calendar',
  channel_id text,
  channel_expiration timestamptz,
  last_synced_at timestamptz,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint microsoft_calendar_connections_org_user_uidx unique (organization_id, user_id)
);

comment on table public.microsoft_calendar_connections is
  'One Microsoft 365 / Outlook Calendar connection per staff user. OAuth tokens live in private.microsoft_calendar_secrets.';

create unique index if not exists microsoft_calendar_connections_channel_id_uidx
  on public.microsoft_calendar_connections (channel_id)
  where channel_id is not null;

create index microsoft_calendar_connections_user_id_idx
  on public.microsoft_calendar_connections (user_id);

create table public.booking_microsoft_busy (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.microsoft_calendar_connections(id) on delete cascade,
  microsoft_event_id text not null,
  summary text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_microsoft_busy_range_chk check (ends_at > starts_at),
  constraint booking_microsoft_busy_event_unique unique (connection_id, microsoft_event_id)
);

comment on table public.booking_microsoft_busy is
  'Busy intervals mirrored from Outlook / Microsoft 365 (external events, not our bookings).';

create index booking_microsoft_busy_org_range_idx
  on public.booking_microsoft_busy (organization_id, starts_at, ends_at);

create table private.microsoft_calendar_secrets (
  connection_id uuid primary key references public.microsoft_calendar_connections(id) on delete cascade,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  sync_token text,
  channel_token_encrypted text,
  updated_at timestamptz not null default now()
);

alter table public.microsoft_calendar_connections enable row level security;
alter table public.booking_microsoft_busy enable row level security;
alter table private.microsoft_calendar_secrets enable row level security;

create policy microsoft_calendar_connections_select
  on public.microsoft_calendar_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy microsoft_calendar_connections_insert
  on public.microsoft_calendar_connections for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy microsoft_calendar_connections_update
  on public.microsoft_calendar_connections for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy microsoft_calendar_connections_delete
  on public.microsoft_calendar_connections for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy booking_microsoft_busy_select
  on public.booking_microsoft_busy for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_microsoft_busy_insert
  on public.booking_microsoft_busy for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy booking_microsoft_busy_update
  on public.booking_microsoft_busy for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy booking_microsoft_busy_delete
  on public.booking_microsoft_busy for delete to authenticated
  using (public.is_org_member(organization_id));

grant select, insert, update, delete on public.microsoft_calendar_connections to authenticated;
grant select, insert, update, delete on public.booking_microsoft_busy to authenticated;
grant select, insert, update, delete on public.microsoft_calendar_connections to service_role;
grant select, insert, update, delete on public.booking_microsoft_busy to service_role;

grant select, insert, update, delete on private.microsoft_calendar_secrets to service_role;
revoke all on private.microsoft_calendar_secrets from public, anon, authenticated;

create or replace function public.get_microsoft_calendar_secrets(p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_row private.microsoft_calendar_secrets;
begin
  if p_connection_id is null then
    return null;
  end if;

  select * into v_row
  from private.microsoft_calendar_secrets s
  where s.connection_id = p_connection_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'connection_id', v_row.connection_id,
    'refresh_token_encrypted', v_row.refresh_token_encrypted,
    'access_token_encrypted', v_row.access_token_encrypted,
    'access_token_expires_at', v_row.access_token_expires_at,
    'sync_token', v_row.sync_token,
    'channel_token_encrypted', v_row.channel_token_encrypted
  );
end;
$function$;

create or replace function public.upsert_microsoft_calendar_secrets(
  p_connection_id uuid,
  p_refresh_token_encrypted text,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_sync_token text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_connection_id is null or p_refresh_token_encrypted is null then
    raise exception 'microsoft secrets required';
  end if;

  if not exists (
    select 1
    from public.microsoft_calendar_connections c
    where c.id = p_connection_id
  ) then
    raise exception 'microsoft connection not found';
  end if;

  insert into private.microsoft_calendar_secrets (
    connection_id,
    refresh_token_encrypted,
    access_token_encrypted,
    access_token_expires_at,
    sync_token,
    updated_at
  )
  values (
    p_connection_id,
    p_refresh_token_encrypted,
    p_access_token_encrypted,
    p_access_token_expires_at,
    p_sync_token,
    now()
  )
  on conflict (connection_id) do update
    set refresh_token_encrypted = excluded.refresh_token_encrypted,
        access_token_encrypted = excluded.access_token_encrypted,
        access_token_expires_at = excluded.access_token_expires_at,
        sync_token = excluded.sync_token,
        updated_at = now();
end;
$function$;

create or replace function public.patch_microsoft_calendar_secrets(
  p_connection_id uuid,
  p_access_token_encrypted text default null,
  p_access_token_expires_at timestamptz default null,
  p_sync_token text default null,
  p_set_sync_token boolean default false,
  p_channel_token_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_connection_id is null then
    raise exception 'microsoft connection required';
  end if;

  update private.microsoft_calendar_secrets
  set
    access_token_encrypted = coalesce(
      p_access_token_encrypted,
      access_token_encrypted
    ),
    access_token_expires_at = case
      when p_access_token_encrypted is not null then p_access_token_expires_at
      else access_token_expires_at
    end,
    sync_token = case
      when p_set_sync_token then p_sync_token
      else sync_token
    end,
    channel_token_encrypted = coalesce(
      p_channel_token_encrypted,
      channel_token_encrypted
    ),
    updated_at = now()
  where connection_id = p_connection_id;

  if not found then
    raise exception 'microsoft secrets not found';
  end if;
end;
$function$;

revoke all on function public.get_microsoft_calendar_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_microsoft_calendar_secrets(uuid) to service_role;

revoke all on function public.upsert_microsoft_calendar_secrets(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.upsert_microsoft_calendar_secrets(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.patch_microsoft_calendar_secrets(uuid, text, timestamptz, text, boolean, text) from public, anon, authenticated;
grant execute on function public.patch_microsoft_calendar_secrets(uuid, text, timestamptz, text, boolean, text) to service_role;
