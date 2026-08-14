-- Per-staff Zoom OAuth. Tokens stay in private.zoom_secrets (not on the Data API).
-- Public bookings create a Zoom meeting on the host’s account when connected.

create table public.zoom_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  zoom_email text,
  zoom_user_id text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zoom_connections_org_user_uidx unique (organization_id, user_id)
);

comment on table public.zoom_connections is
  'One Zoom connection per staff user. OAuth tokens live in private.zoom_secrets.';

create index zoom_connections_user_id_idx on public.zoom_connections (user_id);

create table private.zoom_secrets (
  connection_id uuid primary key references public.zoom_connections(id) on delete cascade,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.booking_appointments
  add column if not exists zoom_meeting_id text,
  add column if not exists zoom_join_url text;

comment on column public.booking_appointments.zoom_meeting_id is
  'Zoom meeting id created for this booking on the host’s Zoom account.';
comment on column public.booking_appointments.zoom_join_url is
  'Client join URL for the Zoom meeting.';

alter table public.zoom_connections enable row level security;
alter table private.zoom_secrets enable row level security;

create policy zoom_connections_select
  on public.zoom_connections for select to authenticated
  using (public.is_org_member(organization_id));

create policy zoom_connections_insert
  on public.zoom_connections for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy zoom_connections_update
  on public.zoom_connections for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

create policy zoom_connections_delete
  on public.zoom_connections for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = (select auth.uid())
  );

grant select, insert, update, delete on public.zoom_connections to authenticated;
grant select, insert, update, delete on public.zoom_connections to service_role;

create or replace function public.get_zoom_secrets(p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_row private.zoom_secrets;
begin
  if p_connection_id is null then
    return null;
  end if;

  select * into v_row
  from private.zoom_secrets s
  where s.connection_id = p_connection_id;

  if v_row.connection_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'connection_id', v_row.connection_id,
    'refresh_token_encrypted', v_row.refresh_token_encrypted,
    'access_token_encrypted', v_row.access_token_encrypted,
    'access_token_expires_at', v_row.access_token_expires_at
  );
end;
$function$;

create or replace function public.upsert_zoom_secrets(
  p_connection_id uuid,
  p_refresh_token_encrypted text,
  p_access_token_encrypted text,
  p_access_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_connection_id is null or p_refresh_token_encrypted is null then
    raise exception 'zoom secrets required';
  end if;

  if not exists (
    select 1
    from public.zoom_connections c
    where c.id = p_connection_id
  ) then
    raise exception 'zoom connection not found';
  end if;

  insert into private.zoom_secrets (
    connection_id,
    refresh_token_encrypted,
    access_token_encrypted,
    access_token_expires_at,
    updated_at
  )
  values (
    p_connection_id,
    p_refresh_token_encrypted,
    p_access_token_encrypted,
    p_access_token_expires_at,
    now()
  )
  on conflict (connection_id) do update
    set refresh_token_encrypted = excluded.refresh_token_encrypted,
        access_token_encrypted = excluded.access_token_encrypted,
        access_token_expires_at = excluded.access_token_expires_at,
        updated_at = now();
end;
$function$;

create or replace function public.patch_zoom_secrets(
  p_connection_id uuid,
  p_access_token_encrypted text default null,
  p_access_token_expires_at timestamptz default null,
  p_refresh_token_encrypted text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_connection_id is null then
    raise exception 'zoom connection required';
  end if;

  update private.zoom_secrets
  set
    access_token_encrypted = coalesce(
      p_access_token_encrypted,
      access_token_encrypted
    ),
    access_token_expires_at = case
      when p_access_token_encrypted is not null then p_access_token_expires_at
      else access_token_expires_at
    end,
    refresh_token_encrypted = coalesce(
      p_refresh_token_encrypted,
      refresh_token_encrypted
    ),
    updated_at = now()
  where connection_id = p_connection_id;

  if not found then
    raise exception 'zoom secrets not found';
  end if;
end;
$function$;

revoke all on function public.get_zoom_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_zoom_secrets(uuid) to service_role;

revoke all on function public.upsert_zoom_secrets(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_zoom_secrets(uuid, text, text, timestamptz) to service_role;

revoke all on function public.patch_zoom_secrets(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.patch_zoom_secrets(uuid, text, timestamptz, text) to service_role;
