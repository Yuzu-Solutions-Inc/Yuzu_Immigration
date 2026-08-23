-- Founding promo is for the first 100 firms that create an account
-- (keep 100 in sync with PRICING.foundingCohortSize). Checkout applies
-- Stripe promo FOUNDING; staff still cannot set founding_rate (trial lock).

comment on column public.organizations.founding_rate is
  'True when this firm is among the first 100 organizations created. Checkout auto-applies Stripe promo FOUNDING.';

with ranked as (
  select id, row_number() over (order by created_at asc, id asc) as n
  from public.organizations
)
update public.organizations o
set founding_rate = true
from ranked r
where o.id = r.id
  and r.n <= 100
  and o.founding_rate is distinct from true;

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_actor_user_id uuid
)
returns public.organizations
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org public.organizations;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_actor_user_id) then
    raise exception 'Profile missing for user';
  end if;

  perform pg_advisory_xact_lock(87223023);

  insert into public.organizations (name, slug, founding_rate)
  values (
    trim(p_name),
    lower(trim(p_slug)),
    (select count(*) from public.organizations) < 100
  )
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org.id, p_actor_user_id, 'admin');

  return v_org;
end;
$function$;

revoke all on function public.create_organization(text, text, uuid) from public;
revoke all on function public.create_organization(text, text, uuid) from anon;
revoke all on function public.create_organization(text, text, uuid) from authenticated;
grant execute on function public.create_organization(text, text, uuid) to service_role;
