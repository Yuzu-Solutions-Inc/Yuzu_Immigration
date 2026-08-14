-- Single-use project call invites + link appointments back to a file.

alter table public.booking_appointments
  add column if not exists project_id uuid
    references public.immigration_projects(id) on delete set null;

create index if not exists booking_appointments_project_id_idx
  on public.booking_appointments (project_id)
  where project_id is not null;

comment on column public.booking_appointments.project_id is
  'Optional immigration file this appointment belongs to (e.g. schedule-call invite).';

create table public.project_booking_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.immigration_projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  host_user_id uuid not null references public.profiles(id) on delete restrict,
  service_id uuid not null references public.booking_services(id) on delete restrict,
  token_hash text not null,
  token_encrypted text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  appointment_id uuid references public.booking_appointments(id) on delete set null,
  emailed_to text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_booking_invites_token_hash_uidx unique (token_hash)
);

comment on table public.project_booking_invites is
  'Single-use booking links emailed from a project. Once appointment_id is set, the link cannot book again.';

create index project_booking_invites_project_idx
  on public.project_booking_invites (project_id, created_at desc);

create index project_booking_invites_org_idx
  on public.project_booking_invites (organization_id);

alter table public.project_booking_invites enable row level security;

create policy project_booking_invites_select_access
  on public.project_booking_invites for select to authenticated
  using (public.can_access_project(project_id));

create policy project_booking_invites_insert_access
  on public.project_booking_invites for insert to authenticated
  with check (
    public.can_access_project(project_id)
    and public.is_org_member(organization_id)
  );

create policy project_booking_invites_update_access
  on public.project_booking_invites for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

create policy project_booking_invites_delete_access
  on public.project_booking_invites for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.project_booking_invites
  to authenticated;
grant select, insert, update, delete on public.project_booking_invites
  to service_role;
