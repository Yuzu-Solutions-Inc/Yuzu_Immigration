-- Track when a client explicitly submits the shared questionnaire.

alter table public.project_form_answers
  add column if not exists questionnaire_submitted_at timestamptz;

comment on column public.project_form_answers.questionnaire_submitted_at is
  'Set when the client clicks Submit on the share-link questionnaire (must be 100% complete).';
