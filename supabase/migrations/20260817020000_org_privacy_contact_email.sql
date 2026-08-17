-- Firm privacy / legal contact for client portal deletion requests (Law 25 / PIPEDA).
alter table public.organizations
  add column if not exists privacy_contact_email text;

comment on column public.organizations.privacy_contact_email is
  'Legal or security contact. Client portal deletion requests are emailed here.';
