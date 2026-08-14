-- Enforce unique template names per organization (case-insensitive).
-- Hard-deleting a template sets immigration_projects.organization_program_id to null;
-- project forms/docs already snapshotted are untouched.

create unique index organization_programs_org_name_uidx
  on public.organization_programs (organization_id, lower(trim(name)));

comment on table public.organization_programs is
  'Firm-defined program templates. Snapshot forms/docs onto projects at create time; later template edits do not mutate existing projects. Template names are unique per organization (case-insensitive).';
