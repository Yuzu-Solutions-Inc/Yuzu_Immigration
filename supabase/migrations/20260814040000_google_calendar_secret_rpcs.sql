-- Google Calendar tokens live in private.google_calendar_secrets, which is not
-- on the Data API. Access them through service_role SECURITY DEFINER RPCs
-- (same pattern as set_customer_portal_password). Do not require DATABASE_URL.

create or replace function public.get_google_calendar_secrets(p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_row private.google_calendar_secrets;
begin
  if p_connection_id is null then
    return null;
  end if;

  select * into v_row
  from private.google_calendar_secrets s
  where s.connection_id = p_connection_id;

  if v_row.connection_id is null then
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

create or replace function public.upsert_google_calendar_secrets(
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
    raise exception 'google secrets required';
  end if;

  if not exists (
    select 1
    from public.google_calendar_connections c
    where c.id = p_connection_id
  ) then
    raise exception 'google connection not found';
  end if;

  insert into private.google_calendar_secrets (
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

create or replace function public.patch_google_calendar_secrets(
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
    raise exception 'google connection required';
  end if;

  update private.google_calendar_secrets
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
    raise exception 'google secrets not found';
  end if;
end;
$function$;

revoke all on function public.get_google_calendar_secrets(uuid) from public, anon, authenticated;
grant execute on function public.get_google_calendar_secrets(uuid) to service_role;

revoke all on function public.upsert_google_calendar_secrets(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.upsert_google_calendar_secrets(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.patch_google_calendar_secrets(uuid, text, timestamptz, text, boolean, text) from public, anon, authenticated;
grant execute on function public.patch_google_calendar_secrets(uuid, text, timestamptz, text, boolean, text) to service_role;
