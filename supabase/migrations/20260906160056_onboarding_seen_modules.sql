-- Track which product modules a staff member has already toured.
-- Adding a module later surfaces new dashboard tasks and a short spotlight tour.

alter table public.staff_onboarding
  add column if not exists seen_modules text[] not null default '{}';

comment on column public.staff_onboarding.seen_modules is
  'Product module ids whose in-app tour this member has finished. New modules not in this list become dashboard onboarding tasks.';

-- Existing members who already finished or skipped the wizard have seen current modules.
update public.staff_onboarding s
set seen_modules = coalesce(
  (
    select array_agg(m.module_id order by m.module_id)
    from public.organization_modules m
    where m.organization_id = s.organization_id
  ),
  '{}'
)
where (s.completed_at is not null or s.dismissed_at is not null)
  and coalesce(cardinality(s.seen_modules), 0) = 0;
