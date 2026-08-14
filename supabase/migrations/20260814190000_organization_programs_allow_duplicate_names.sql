-- Allow multiple firm program templates with the same display name.
drop index if exists public.organization_programs_org_name_uidx;

comment on table public.organization_programs is
  'Firm-defined program templates. Snapshot forms/docs onto projects at create time; later template edits do not mutate existing projects. Duplicate names are allowed within an organization.';
