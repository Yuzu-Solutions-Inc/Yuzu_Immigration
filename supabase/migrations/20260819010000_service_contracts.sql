-- In-house service contracts: templates, filled envelopes, signers, audit trail.

create type public.contract_envelope_status as enum (
  'sent',
  'viewed',
  'partially_signed',
  'completed',
  'declined',
  'expired',
  'voided'
);

create type public.contract_signer_role as enum (
  'client',
  'consultant'
);

create type public.contract_signer_status as enum (
  'pending',
  'viewed',
  'signed',
  'declined'
);

create type public.contract_signature_kind as enum (
  'typed',
  'drawn'
);

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body_html text not null,
  require_consultant_signature boolean not null default true,
  send_on_booking boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_templates_title_chk
    check (char_length(trim(title)) between 1 and 120),
  constraint contract_templates_body_chk
    check (char_length(body_html) between 1 and 200000)
);

comment on table public.contract_templates is
  'Reusable service contract templates. HTML with {{merge}} tokens and signature blocks; assigned to one or more booking services.';

create index contract_templates_org_idx
  on public.contract_templates (organization_id, created_at);

create table public.contract_template_services (
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  service_id uuid not null references public.booking_services(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  primary key (template_id, service_id)
);

comment on table public.contract_template_services is
  'Services a contract template applies to. A service may have many contracts.';

create index contract_template_services_service_idx
  on public.contract_template_services (service_id);

create index contract_template_services_org_idx
  on public.contract_template_services (organization_id);

create table public.contract_envelopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.contract_templates(id) on delete restrict,
  appointment_id uuid not null references public.booking_appointments(id) on delete cascade,
  title text not null,
  filled_html text not null,
  filled_sha256 text not null,
  signed_pdf_storage_path text,
  signed_pdf_sha256 text,
  status public.contract_envelope_status not null default 'sent',
  locale text not null default 'en',
  expires_at timestamptz not null,
  sent_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_envelopes_title_chk
    check (char_length(trim(title)) between 1 and 120),
  constraint contract_envelopes_hash_chk
    check (char_length(filled_sha256) = 64),
  constraint contract_envelopes_pdf_hash_chk
    check (signed_pdf_sha256 is null or char_length(signed_pdf_sha256) = 64),
  constraint contract_envelopes_locale_chk
    check (locale in ('en', 'fr', 'es'))
);

comment on table public.contract_envelopes is
  'A filled contract sent for signature on a booking. filled_html is org-DEK encrypted; signed PDF is encrypted in Storage.';

create index contract_envelopes_org_idx
  on public.contract_envelopes (organization_id, created_at desc);

create index contract_envelopes_appointment_idx
  on public.contract_envelopes (appointment_id);

create unique index contract_envelopes_active_uidx
  on public.contract_envelopes (appointment_id, template_id)
  where status in ('sent', 'viewed', 'partially_signed');

create table public.contract_signers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  envelope_id uuid not null references public.contract_envelopes(id) on delete cascade,
  role public.contract_signer_role not null,
  sort_order integer not null default 0,
  full_name text not null,
  email text not null,
  token_hash text,
  token_encrypted text,
  status public.contract_signer_status not null default 'pending',
  signed_at timestamptz,
  declined_at timestamptz,
  viewed_at timestamptz,
  signature_kind public.contract_signature_kind,
  signature_text text,
  signature_image text,
  ip text,
  user_agent text,
  consent_accepted_at timestamptz,
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_signers_sort_chk
    check (sort_order >= 0 and sort_order < 10),
  constraint contract_signers_consent_version_chk
    check (consent_version is null or char_length(consent_version) between 1 and 40)
);

comment on table public.contract_signers is
  'Ordered signers on a contract envelope. Names, emails, tokens, and signature marks are org-DEK encrypted.';

create unique index contract_signers_envelope_role_uidx
  on public.contract_signers (envelope_id, role);

create unique index contract_signers_token_hash_uidx
  on public.contract_signers (token_hash)
  where token_hash is not null;

create index contract_signers_envelope_idx
  on public.contract_signers (envelope_id, sort_order);

create index contract_signers_org_idx
  on public.contract_signers (organization_id);

create table public.contract_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  envelope_id uuid not null references public.contract_envelopes(id) on delete cascade,
  signer_id uuid references public.contract_signers(id) on delete set null,
  event_type text not null,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint contract_audit_events_type_chk
    check (char_length(trim(event_type)) between 1 and 80)
);

comment on table public.contract_audit_events is
  'Append-only evidence log for a contract envelope (sent, viewed, consent, signed, completed, declined, voided).';

create index contract_audit_events_envelope_idx
  on public.contract_audit_events (envelope_id, created_at);

create index contract_audit_events_org_idx
  on public.contract_audit_events (organization_id);

alter table public.contract_templates enable row level security;
alter table public.contract_template_services enable row level security;
alter table public.contract_envelopes enable row level security;
alter table public.contract_signers enable row level security;
alter table public.contract_audit_events enable row level security;

create policy contract_templates_select
  on public.contract_templates for select to authenticated
  using (public.is_org_member(organization_id));

create policy contract_templates_insert
  on public.contract_templates for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy contract_templates_update
  on public.contract_templates for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy contract_templates_delete
  on public.contract_templates for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy contract_template_services_select
  on public.contract_template_services for select to authenticated
  using (public.is_org_member(organization_id));

create policy contract_template_services_insert
  on public.contract_template_services for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy contract_template_services_update
  on public.contract_template_services for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy contract_template_services_delete
  on public.contract_template_services for delete to authenticated
  using (public.is_org_full_access(organization_id));

create policy contract_envelopes_select
  on public.contract_envelopes for select to authenticated
  using (public.is_org_member(organization_id));

create policy contract_envelopes_insert
  on public.contract_envelopes for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy contract_envelopes_update
  on public.contract_envelopes for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy contract_signers_select
  on public.contract_signers for select to authenticated
  using (public.is_org_member(organization_id));

create policy contract_signers_insert
  on public.contract_signers for insert to authenticated
  with check (public.is_org_full_access(organization_id));

create policy contract_signers_update
  on public.contract_signers for update to authenticated
  using (public.is_org_full_access(organization_id))
  with check (public.is_org_full_access(organization_id));

create policy contract_audit_events_select
  on public.contract_audit_events for select to authenticated
  using (public.is_org_member(organization_id));

-- Inserts go through service_role (public sign + issue). Staff may not forge events.
create policy contract_audit_events_insert
  on public.contract_audit_events for insert to authenticated
  with check (false);

grant select, insert, update, delete on public.contract_templates to authenticated;
grant select, insert, update, delete on public.contract_templates to service_role;
grant select, insert, update, delete on public.contract_template_services to authenticated;
grant select, insert, update, delete on public.contract_template_services to service_role;
grant select, insert, update on public.contract_envelopes to authenticated;
grant select, insert, update, delete on public.contract_envelopes to service_role;
grant select, insert, update on public.contract_signers to authenticated;
grant select, insert, update, delete on public.contract_signers to service_role;
grant select on public.contract_audit_events to authenticated;
grant select, insert, update, delete on public.contract_audit_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-envelopes',
  'contract-envelopes',
  false,
  20971520,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Encrypted blobs; staff download via the app server (service_role), not Storage RLS.
