-- Remove plaintext name/title search columns. List search matches after
-- decrypting org-DEK ciphertext in the app.

drop index if exists public.people_org_search_name_trgm_idx;
drop index if exists public.immigration_projects_org_search_title_trgm_idx;

alter table public.people
  drop column if exists search_name;

alter table public.immigration_projects
  drop column if exists search_title;
