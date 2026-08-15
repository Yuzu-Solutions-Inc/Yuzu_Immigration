-- Client-set passwords on form share links (bcrypt in private schema).

create table private.form_share_link_secrets (
  share_link_id uuid primary key
    references public.form_share_links(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table private.form_share_link_secrets enable row level security;

grant select, insert, update, delete on private.form_share_link_secrets to service_role;
revoke all on private.form_share_link_secrets from public, anon, authenticated;

comment on table private.form_share_link_secrets is
  'bcrypt hashes for client share-link passwords. service_role only.';

-- Rate-limit password verify / forgot-password (service_role only).
create table public.share_link_auth_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  token_hash text not null,
  kind text not null check (kind in ('verify_fail', 'forgot_password')),
  ip_hash text,
  created_at timestamptz not null default now()
);

alter table public.share_link_auth_events enable row level security;

grant select, insert, delete on public.share_link_auth_events to service_role;
revoke all on public.share_link_auth_events from public, anon, authenticated;

create index share_link_auth_events_lookup_idx
  on public.share_link_auth_events (organization_id, token_hash, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Password helpers (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.form_share_link_password_exists(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.form_share_links f
    join private.form_share_link_secrets s on s.share_link_id = f.id
    where f.token_hash = p_token_hash
      and f.revoked_at is null
      and f.expires_at > now()
  );
$function$;

revoke all on function public.form_share_link_password_exists(text) from public;
revoke all on function public.form_share_link_password_exists(text) from anon;
revoke all on function public.form_share_link_password_exists(text) from authenticated;
grant execute on function public.form_share_link_password_exists(text) to service_role;

create or replace function public.client_set_form_share_link_password(
  p_token_hash text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link public.form_share_links;
begin
  if p_password is null
     or char_length(p_password) < 8
     or p_password !~ '[A-Z]'
     or p_password !~ '[0-9]'
     or p_password !~ '[^A-Za-z0-9]'
  then
    raise exception 'invalid_password';
  end if;

  select * into v_link
  from public.form_share_links f
  where f.token_hash = p_token_hash
    and f.revoked_at is null
    and f.expires_at > now();

  if v_link.id is null then
    return false;
  end if;

  if exists (
    select 1
    from private.form_share_link_secrets s
    where s.share_link_id = v_link.id
  ) then
    raise exception 'password_already_set';
  end if;

  insert into private.form_share_link_secrets (share_link_id, password_hash)
  values (
    v_link.id,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12))
  );

  return true;
end;
$function$;

revoke all on function public.client_set_form_share_link_password(text, text) from public;
revoke all on function public.client_set_form_share_link_password(text, text) from anon;
revoke all on function public.client_set_form_share_link_password(text, text) from authenticated;
grant execute on function public.client_set_form_share_link_password(text, text) to service_role;

create or replace function public.verify_form_share_link_password(
  p_token_hash text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text;
begin
  select s.password_hash into v_hash
  from public.form_share_links f
  join private.form_share_link_secrets s on s.share_link_id = f.id
  where f.token_hash = p_token_hash
    and f.revoked_at is null
    and f.expires_at > now();

  if v_hash is null then
    return false;
  end if;

  return extensions.crypt(p_password, v_hash) = v_hash;
end;
$function$;

revoke all on function public.verify_form_share_link_password(text, text) from public;
revoke all on function public.verify_form_share_link_password(text, text) from anon;
revoke all on function public.verify_form_share_link_password(text, text) from authenticated;
grant execute on function public.verify_form_share_link_password(text, text) to service_role;
