-- Link consultation notes to booked meetings, and allow manual meeting logs.
alter table public.person_notes
  add column if not exists appointment_id uuid references public.booking_appointments(id) on delete set null,
  add column if not exists occurred_at timestamptz,
  add column if not exists status public.booking_appointment_status;

comment on column public.person_notes.appointment_id is
  'Booked appointment this note belongs to. Null for manually logged meetings.';
comment on column public.person_notes.occurred_at is
  'Meeting date/time for manual logs. Booked meetings use booking_appointments.starts_at.';
comment on column public.person_notes.status is
  'Meeting status for manual logs. Booked meetings use booking_appointments.status.';

create unique index if not exists person_notes_appointment_id_uidx
  on public.person_notes (appointment_id)
  where appointment_id is not null;

create index if not exists person_notes_person_occurred_idx
  on public.person_notes (person_id, occurred_at desc);

alter table public.person_notes
  drop constraint if exists person_notes_body_not_blank;

alter table public.person_notes
  drop constraint if exists person_notes_has_meeting_or_note;

alter table public.person_notes
  add constraint person_notes_has_meeting_or_note check (
    appointment_id is not null
    or occurred_at is not null
    or char_length(trim(body)) >= 1
  );

update public.person_notes
set
  occurred_at = coalesce(occurred_at, created_at),
  status = coalesce(status, 'completed'::public.booking_appointment_status)
where appointment_id is null;

drop policy if exists person_notes_insert_member on public.person_notes;
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
    and (
      appointment_id is null
      or exists (
        select 1
        from public.booking_appointments a
        where a.id = person_notes.appointment_id
          and a.organization_id = person_notes.organization_id
          and a.person_id = person_notes.person_id
      )
    )
  );

drop policy if exists person_notes_update_member on public.person_notes;
create policy person_notes_update_member
  on public.person_notes
  for update
  to authenticated
  using (is_org_member(organization_id))
  with check (
    is_org_member(organization_id)
    and exists (
      select 1
      from public.people p
      where p.id = person_notes.person_id
        and p.organization_id = person_notes.organization_id
    )
    and (
      appointment_id is null
      or exists (
        select 1
        from public.booking_appointments a
        where a.id = person_notes.appointment_id
          and a.organization_id = person_notes.organization_id
          and a.person_id = person_notes.person_id
      )
    )
  );
