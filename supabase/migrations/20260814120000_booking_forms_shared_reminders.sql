-- Org-level booking forms (one form per service) and multi-service reminders.
create table public.booking_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_forms_title_chk
    check (char_length(trim(title)) between 1 and 80)
);

comment on table public.booking_forms is
  'Reusable booking intake form. Assigned to one or more services; each service uses at most one form.';

create index booking_forms_org_idx on public.booking_forms (organization_id);

alter table public.booking_services
  add column if not exists form_id uuid references public.booking_forms(id) on delete set null;

create index booking_services_form_idx on public.booking_services (form_id);

alter table public.booking_service_form_fields
  add column if not exists form_id uuid references public.booking_forms(id) on delete cascade;

-- One form per service that already has custom questions. Form id matches the service id.
insert into public.booking_forms (id, organization_id, title)
select s.id, s.organization_id, left(s.title, 80)
from public.booking_services s
where exists (
  select 1
  from public.booking_service_form_fields f
  where f.service_id = s.id
)
on conflict (id) do nothing;

update public.booking_services s
set form_id = s.id
where exists (
  select 1 from public.booking_forms f where f.id = s.id
);

update public.booking_service_form_fields f
set form_id = f.service_id
where f.form_id is null;

delete from public.booking_service_form_fields where form_id is null;

alter table public.booking_service_form_fields
  alter column form_id set not null;

alter table public.booking_service_form_fields
  drop constraint if exists booking_service_form_fields_service_key_uidx;

alter table public.booking_service_form_fields
  drop column if exists service_id;

alter table public.booking_service_form_fields
  add constraint booking_form_fields_form_key_uidx unique (form_id, field_key);

drop index if exists booking_service_form_fields_service_idx;

create index booking_service_form_fields_form_idx
  on public.booking_service_form_fields (form_id, sort_order);

alter table public.booking_service_email_automations
  add column if not exists title text;

update public.booking_service_email_automations
set title = left(trim(subject), 80)
where title is null or trim(title) = '';

alter table public.booking_service_email_automations
  alter column title set not null;

alter table public.booking_service_email_automations
  drop constraint if exists booking_service_email_automations_title_chk;

alter table public.booking_service_email_automations
  add constraint booking_service_email_automations_title_chk
    check (char_length(trim(title)) between 1 and 80);

create table public.booking_email_automation_services (
  automation_id uuid not null references public.booking_service_email_automations(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (automation_id, service_id)
);

comment on table public.booking_email_automation_services is
  'Services a reminder email applies to. A service may have many reminders.';

create index booking_email_automation_services_service_idx
  on public.booking_email_automation_services (service_id);

create index booking_email_automation_services_org_idx
  on public.booking_email_automation_services (organization_id);

insert into public.booking_email_automation_services (
  automation_id,
  service_id,
  organization_id
)
select id, service_id, organization_id
from public.booking_service_email_automations
on conflict do nothing;

alter table public.booking_service_email_automations
  drop column if exists service_id;

drop index if exists booking_service_email_automations_service_idx;

alter table public.booking_forms enable row level security;
alter table public.booking_email_automation_services enable row level security;

create policy booking_forms_select
  on public.booking_forms for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_forms_insert
  on public.booking_forms for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_forms_update
  on public.booking_forms for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_forms_delete
  on public.booking_forms for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy booking_email_automation_services_select
  on public.booking_email_automation_services for select to authenticated
  using (public.is_org_member(organization_id));

create policy booking_email_automation_services_insert
  on public.booking_email_automation_services for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy booking_email_automation_services_update
  on public.booking_email_automation_services for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy booking_email_automation_services_delete
  on public.booking_email_automation_services for delete to authenticated
  using (public.is_org_full_access(organization_id));

grant select, insert, update, delete on public.booking_forms to authenticated;
grant select, insert, update, delete on public.booking_forms to service_role;
grant select, insert, update, delete on public.booking_email_automation_services
  to authenticated;
grant select, insert, update, delete on public.booking_email_automation_services
  to service_role;
