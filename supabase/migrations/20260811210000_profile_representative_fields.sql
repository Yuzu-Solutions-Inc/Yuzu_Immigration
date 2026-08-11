-- Move IMM 5476 representative details from organizations → profiles (per staff account).

alter table public.profiles
  add column if not exists rep_family_name text,
  add column if not exists rep_given_name text,
  add column if not exists rep_organization text,
  add column if not exists rep_email text,
  add column if not exists rep_phone text,
  add column if not exists rep_phone_country_code text,
  add column if not exists rep_membership_id text,
  add column if not exists rep_street_num text,
  add column if not exists rep_street_name text,
  add column if not exists rep_city text,
  add column if not exists rep_province text,
  add column if not exists rep_country text,
  add column if not exists rep_postal_code text;

comment on column public.profiles.rep_family_name is
  'IMM 5476 representative family name for this staff account.';

-- Copy existing firm-level values onto each member profile (once).
update public.profiles p
set
  rep_family_name = coalesce(p.rep_family_name, o.rep_family_name),
  rep_given_name = coalesce(p.rep_given_name, o.rep_given_name),
  rep_organization = coalesce(p.rep_organization, o.rep_organization, o.name),
  rep_email = coalesce(p.rep_email, o.rep_email),
  rep_phone = coalesce(p.rep_phone, o.rep_phone),
  rep_phone_country_code = coalesce(p.rep_phone_country_code, o.rep_phone_country_code),
  rep_membership_id = coalesce(p.rep_membership_id, o.rep_membership_id),
  rep_street_num = coalesce(p.rep_street_num, o.rep_street_num),
  rep_street_name = coalesce(p.rep_street_name, o.rep_street_name),
  rep_city = coalesce(p.rep_city, o.rep_city),
  rep_province = coalesce(p.rep_province, o.rep_province),
  rep_country = coalesce(p.rep_country, o.rep_country),
  rep_postal_code = coalesce(p.rep_postal_code, o.rep_postal_code),
  updated_at = now()
from public.organization_members m
join public.organizations o on o.id = m.organization_id
where m.user_id = p.id
  and (
    o.rep_family_name is not null
    or o.rep_given_name is not null
    or o.rep_organization is not null
    or o.rep_email is not null
    or o.rep_membership_id is not null
  );

alter table public.organizations
  drop column if exists rep_family_name,
  drop column if exists rep_given_name,
  drop column if exists rep_organization,
  drop column if exists rep_email,
  drop column if exists rep_phone,
  drop column if exists rep_phone_country_code,
  drop column if exists rep_membership_id,
  drop column if exists rep_street_num,
  drop column if exists rep_street_name,
  drop column if exists rep_city,
  drop column if exists rep_province,
  drop column if exists rep_country,
  drop column if exists rep_postal_code;
