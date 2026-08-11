-- Person-scoped IRCC forms: assign each copy to a project participant.
alter table public.project_forms
  add column if not exists person_id uuid references public.people(id) on delete set null;

comment on column public.project_forms.person_id is
  'Person this form copy belongs to. Null for project-scoped forms (e.g. document checklists).';

create index if not exists project_forms_person_id_idx
  on public.project_forms (person_id)
  where person_id is not null;

create index if not exists project_forms_project_person_idx
  on public.project_forms (project_id, person_id);

create unique index if not exists project_forms_person_scoped_unique
  on public.project_forms (project_id, form_code, person_id)
  where person_id is not null;

create unique index if not exists project_forms_project_scoped_unique
  on public.project_forms (project_id, form_code)
  where person_id is null;

-- Backfill person-scoped forms onto the active principal.
update public.project_forms pf
set person_id = principals.person_id
from (
  select distinct on (pp.project_id)
    pp.project_id,
    pp.person_id
  from public.project_participants pp
  where pp.left_at is null
    and pp.role = 'principal'
  order by pp.project_id, pp.created_at asc
) as principals
where pf.project_id = principals.project_id
  and pf.person_id is null
  and pf.form_code in (
    'imm1294','imm1295','imm5710','imm5707','imm5476','imm5475','imm5646'
  );

-- Clone person-scoped kit forms for other active participants.
insert into public.project_forms (
  organization_id,
  project_id,
  form_code,
  status,
  is_required,
  sort_order,
  person_id
)
select
  pf.organization_id,
  pf.project_id,
  pf.form_code,
  'todo'::public.project_form_status,
  pf.is_required,
  pf.sort_order + 1,
  pp.person_id
from public.project_forms pf
join public.project_participants pp
  on pp.project_id = pf.project_id
 and pp.left_at is null
 and pp.person_id is distinct from pf.person_id
join public.project_participants prin
  on prin.project_id = pf.project_id
 and prin.person_id = pf.person_id
 and prin.role = 'principal'
 and prin.left_at is null
where pf.person_id is not null
  and pf.form_code in (
    'imm1294','imm1295','imm5710','imm5707','imm5476','imm5475','imm5646'
  )
  and not exists (
    select 1
    from public.project_forms existing
    where existing.project_id = pf.project_id
      and existing.form_code = pf.form_code
      and existing.person_id = pp.person_id
  );

-- Migrate legacy flat answer bags into byPerson[principalId].
with principal as (
  select distinct on (pp.project_id)
    pp.project_id,
    pp.person_id
  from public.project_participants pp
  where pp.left_at is null
    and pp.role = 'principal'
  order by pp.project_id, pp.created_at
)
update public.project_form_answers a
set
  answers = jsonb_build_object(
    'byPerson', jsonb_build_object(p.person_id::text, a.answers),
    'project', '{}'::jsonb
  ),
  updated_at = now()
from principal p
where a.project_id = p.project_id
  and not (a.answers ? 'byPerson')
  and jsonb_typeof(a.answers) = 'object';
