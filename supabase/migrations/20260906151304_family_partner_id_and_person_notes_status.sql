-- Align remaining Yuzu family-CRM columns onto MyConsultant.
-- Applied live as 20260906151304_family_partner_id_and_person_notes_status.

alter table public.booking_appointments
  add column if not exists partner_id uuid references public.partners(id) on delete set null;
alter table public.payment_requests
  add column if not exists partner_id uuid references public.partners(id) on delete set null;
alter table public.people
  add column if not exists partner_id uuid references public.partners(id) on delete restrict;

create unique index if not exists people_partner_id_uidx on public.people (partner_id);
create index if not exists booking_appointments_partner_id_idx on public.booking_appointments (partner_id);
create index if not exists payment_requests_partner_id_idx on public.payment_requests (partner_id);

-- App + Yuzu treat person_notes.status as text; MyConsultant accidentally used the booking enum.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'person_notes'
      and column_name = 'status'
      and udt_name = 'booking_appointment_status'
  ) then
    alter table public.person_notes alter column status type text using status::text;
  end if;
end $$;
