-- Inbound CRM mail: opaque per-org and per-project local-parts, stored messages,
-- encrypted attachments, and staff assignment. Routing key is the To alias.

alter table public.organizations
  add column if not exists inbound_local_part text;

alter table public.immigration_projects
  add column if not exists inbound_local_part text;

create or replace function public.generate_inbound_local_part(p_prefix text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  i int := 0;
begin
  if p_prefix not in ('o_', 'p_') then
    raise exception 'invalid inbound prefix';
  end if;
  loop
    i := i + 1;
    v_token := p_prefix || encode(extensions.gen_random_bytes(12), 'hex');
    exit when not exists (
      select 1 from public.organizations o where o.inbound_local_part = v_token
    ) and not exists (
      select 1 from public.immigration_projects p where p.inbound_local_part = v_token
    );
    if i > 24 then
      raise exception 'inbound local part collision';
    end if;
  end loop;
  return v_token;
end;
$function$;

revoke all on function public.generate_inbound_local_part(text) from public;
revoke all on function public.generate_inbound_local_part(text) from anon;
revoke all on function public.generate_inbound_local_part(text) from authenticated;
grant execute on function public.generate_inbound_local_part(text) to service_role;

update public.organizations
set inbound_local_part = public.generate_inbound_local_part('o_')
where inbound_local_part is null;

update public.immigration_projects
set inbound_local_part = public.generate_inbound_local_part('p_')
where inbound_local_part is null;

alter table public.organizations
  alter column inbound_local_part set not null;

alter table public.immigration_projects
  alter column inbound_local_part set not null;

alter table public.organizations
  drop constraint if exists organizations_inbound_local_part_format;
alter table public.organizations
  add constraint organizations_inbound_local_part_format
  check (inbound_local_part ~ '^o_[0-9a-f]{24}$');

alter table public.immigration_projects
  drop constraint if exists immigration_projects_inbound_local_part_format;
alter table public.immigration_projects
  add constraint immigration_projects_inbound_local_part_format
  check (inbound_local_part ~ '^p_[0-9a-f]{24}$');

create unique index if not exists organizations_inbound_local_part_uidx
  on public.organizations (inbound_local_part);

create unique index if not exists immigration_projects_inbound_local_part_uidx
  on public.immigration_projects (inbound_local_part);

comment on column public.organizations.inbound_local_part is
  'Opaque Resend receiving local-part for unmatched firm mail (o_ + 24 hex).';
comment on column public.immigration_projects.inbound_local_part is
  'Opaque Resend receiving local-part for this file (p_ + 24 hex).';

create or replace function public.organizations_set_inbound_local_part()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.inbound_local_part is null or btrim(new.inbound_local_part) = '' then
    new.inbound_local_part := public.generate_inbound_local_part('o_');
  end if;
  return new;
end;
$function$;

create or replace function public.immigration_projects_set_inbound_local_part()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.inbound_local_part is null or btrim(new.inbound_local_part) = '' then
    new.inbound_local_part := public.generate_inbound_local_part('p_');
  end if;
  return new;
end;
$function$;

drop trigger if exists organizations_inbound_local_part_bi on public.organizations;
create trigger organizations_inbound_local_part_bi
  before insert on public.organizations
  for each row
  execute function public.organizations_set_inbound_local_part();

drop trigger if exists immigration_projects_inbound_local_part_bi on public.immigration_projects;
create trigger immigration_projects_inbound_local_part_bi
  before insert on public.immigration_projects
  for each row
  execute function public.immigration_projects_set_inbound_local_part();

create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.immigration_projects(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  assignment_status text not null,
  direction text not null,
  unknown_sender boolean not null default false,
  resend_email_id text,
  from_email_lookup_hash text,
  from_email text not null,
  to_address text not null,
  to_local_part text not null,
  subject text not null,
  body_text text not null,
  rfc_message_id text,
  in_reply_to text,
  received_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inbound_messages_assignment_status_chk
    check (assignment_status in ('project', 'person', 'unassigned')),
  constraint inbound_messages_direction_chk
    check (direction in ('inbound', 'outbound'))
);

comment on table public.inbound_messages is
  'CRM email thread. from/subject/body are org-DEK encrypted. To alias is the routing key.';

create unique index inbound_messages_resend_email_id_uidx
  on public.inbound_messages (resend_email_id)
  where resend_email_id is not null;

create index inbound_messages_org_received_idx
  on public.inbound_messages (organization_id, received_at desc);

create index inbound_messages_project_received_idx
  on public.inbound_messages (project_id, received_at desc)
  where project_id is not null;

create index inbound_messages_person_received_idx
  on public.inbound_messages (person_id, received_at desc)
  where person_id is not null;

create index inbound_messages_unassigned_idx
  on public.inbound_messages (organization_id, received_at desc)
  where assignment_status = 'unassigned';

create index inbound_messages_rfc_message_id_idx
  on public.inbound_messages (organization_id, rfc_message_id)
  where rfc_message_id is not null;

create table public.inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.inbound_messages(id) on delete cascade,
  filename text not null,
  content_type text not null,
  byte_size integer not null,
  storage_path text not null,
  encryption_alg text not null default 'aes-256-gcm',
  skipped boolean not null default false,
  skip_reason text,
  filed_request_id uuid references public.project_document_requests(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.inbound_attachments is
  'Encrypted inbound email attachments. Staff may file onto a project document request.';

create index inbound_attachments_message_id_idx
  on public.inbound_attachments (message_id);

create index inbound_attachments_org_id_idx
  on public.inbound_attachments (organization_id);

alter table public.inbound_messages enable row level security;
alter table public.inbound_attachments enable row level security;

create policy inbound_messages_select_member
  on public.inbound_messages for select to authenticated
  using (public.is_org_member(organization_id));

create policy inbound_messages_insert_member
  on public.inbound_messages for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy inbound_messages_update_member
  on public.inbound_messages for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy inbound_attachments_select_member
  on public.inbound_attachments for select to authenticated
  using (public.is_org_member(organization_id));

create policy inbound_attachments_update_member
  on public.inbound_attachments for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.inbound_messages to authenticated;
grant select, update on public.inbound_attachments to authenticated;
grant select, insert, update, delete on public.inbound_messages to service_role;
grant select, insert, update, delete on public.inbound_attachments to service_role;

alter table public.project_document_files
  drop constraint if exists project_document_files_uploaded_via_check;

alter table public.project_document_files
  add constraint project_document_files_uploaded_via_check
  check (uploaded_via in ('portal', 'staff', 'email'));

alter table public.staff_notifications
  drop constraint if exists staff_notifications_kind_check;

alter table public.staff_notifications
  add constraint staff_notifications_kind_check
  check (kind in (
    'documents_uploaded',
    'forms_complete',
    'form_certification',
    'inbound_email'
  ));
