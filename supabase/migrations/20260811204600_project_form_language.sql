-- IRCC PDF blanks are English or French only.
alter table public.immigration_projects
  add column if not exists form_language text not null default 'en';

alter table public.immigration_projects
  drop constraint if exists immigration_projects_form_language_check;

alter table public.immigration_projects
  add constraint immigration_projects_form_language_check
  check (form_language in ('en', 'fr'));

comment on column public.immigration_projects.form_language is
  'Language of IRCC PDF forms for this project (en or fr).';

-- Keep questionnaire answers in sync with the project setting.
update public.project_form_answers a
set answers = jsonb_set(
  coalesce(a.answers, '{}'::jsonb),
  '{formLanguage}',
  to_jsonb(case when p.form_language = 'fr' then 'f' else 'e' end),
  true
),
updated_at = now()
from public.immigration_projects p
where a.project_id = p.id;
