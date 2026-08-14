-- Per-service booking form fields. Answers are stored encrypted on appointments.
create type public.booking_form_field_type as enum (
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'date',
  'select',
  'checkbox'
);

create table public.booking_service_form_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete cascade,
  field_key text not null,
  label text not null,
  help_text text,
  field_type public.booking_form_field_type not null default 'text',
  options text[] not null default '{}'::text[],
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_service_form_fields_key_chk
    check (field_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint booking_service_form_fields_label_chk
    check (char_length(trim(label)) between 1 and 80),
  constraint booking_service_form_fields_help_chk
    check (help_text is null or char_length(help_text) <= 300),
  constraint booking_service_form_fields_options_len_chk
    check (cardinality(options) <= 20),
  constraint booking_service_form_fields_service_key_uidx
    unique (service_id, field_key)
);

comment on table public.booking_service_form_fields is
  'Consultant-defined intake fields on a bookable service. field_key is the {{variable}} for emails and later contracts.';

create index booking_service_form_fields_service_idx
  on public.booking_service_form_fields (service_id, sort_order);

create index booking_service_form_fields_org_idx
  on public.booking_service_form_fields (organization_id);

alter table public.booking_appointments
  add column if not exists form_answers jsonb;

comment on column public.booking_appointments.form_answers is
  'Org-DEK encrypted custom booking-form answers. Object keys match field_key.';

alter table public.booking_service_form_fields enable row level security;

create policy booking_service_form_fields_select
  on public.booking_service_form_fields for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_service_form_fields_insert
  on public.booking_service_form_fields for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_service_form_fields_update
  on public.booking_service_form_fields for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_service_form_fields_delete
  on public.booking_service_form_fields for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.booking_service_form_fields
  to authenticated;
grant select, insert, update, delete on public.booking_service_form_fields
  to service_role;

grant usage on type public.booking_form_field_type to authenticated, service_role;
