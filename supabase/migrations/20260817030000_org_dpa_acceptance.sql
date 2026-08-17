-- Clickwrap record for the firm data processing addendum (Law 25 written contract).
alter table public.organizations
  add column if not exists dpa_accepted_at timestamptz,
  add column if not exists dpa_version text,
  add column if not exists dpa_accepted_by uuid;

comment on column public.organizations.dpa_accepted_at is
  'When a firm administrator accepted the current Firm DPA by in-product clickwrap.';
comment on column public.organizations.dpa_version is
  'Firm DPA version string accepted (e.g. 2026-08-16).';
comment on column public.organizations.dpa_accepted_by is
  'auth.users id of the administrator who accepted the DPA.';
