-- Internal consultation notes for a person (firm-only).
create table public.person_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_notes_body_not_blank check (char_length(trim(body)) >= 1)
);

comment on table public.person_notes is
  'Internal consultant notes from consultations. Private to the firm.';

create index person_notes_person_id_idx
  on public.person_notes (person_id);

create index person_notes_organization_id_idx
  on public.person_notes (organization_id);

create index person_notes_person_created_idx
  on public.person_notes (person_id, created_at desc);

alter table public.person_notes enable row level security;

create policy person_notes_select_member
  on public.person_notes
  for select
  to authenticated
  using (is_org_member(organization_id));

create policy person_notes_insert_member
  on public.person_notes
  for insert
  to authenticated
  with check (
    is_org_member(organization_id)
    and exists (
      select 1
      from public.people p
      where p.id = person_notes.person_id
        and p.organization_id = person_notes.organization_id
    )
  );

create policy person_notes_update_member
  on public.person_notes
  for update
  to authenticated
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));

create policy person_notes_delete_member
  on public.person_notes
  for delete
  to authenticated
  using (is_org_member(organization_id));

grant select, insert, update, delete on public.person_notes to authenticated;
grant select, insert, update, delete on public.person_notes to service_role;
