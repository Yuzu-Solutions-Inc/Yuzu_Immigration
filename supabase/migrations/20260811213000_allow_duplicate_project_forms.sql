-- Allow the same IRCC form code more than once on a project (e.g. extra copies).
alter table public.project_forms
  drop constraint if exists project_forms_project_id_form_code_key;
