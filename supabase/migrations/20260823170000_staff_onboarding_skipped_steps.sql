-- Skipped calendar/meeting connections count as fulfilled for onboarding.

alter table public.staff_onboarding
  add column if not exists skipped_steps text[] not null default '{}';

comment on column public.staff_onboarding.skipped_steps is
  'Wizard steps the member skipped (calendar, meeting). Those checks count as done.';
