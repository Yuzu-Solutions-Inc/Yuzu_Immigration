-- Which staff member represents / owns the immigration file within the firm.
alter table public.immigration_projects
  add column if not exists representative_user_id uuid
    references public.profiles (id) on delete set null;

create index if not exists immigration_projects_representative_user_id_idx
  on public.immigration_projects (representative_user_id);

create index if not exists immigration_projects_org_representative_idx
  on public.immigration_projects (organization_id, representative_user_id);

comment on column public.immigration_projects.representative_user_id is
  'Staff profile (organization member) who represents this project for the firm.';
