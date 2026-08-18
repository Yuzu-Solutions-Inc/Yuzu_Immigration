-- Per-firm client portal Google (Gmail) sign-in.
-- Portal sessions stay cookie-based; this does not create auth.users.

alter table public.organizations
  add column if not exists portal_google_login_enabled boolean not null default false;

comment on column public.organizations.portal_google_login_enabled is
  'When true, clients whose file email matches a verified Google account can sign in to the portal without a password.';

alter table public.customer_portal_access
  add column if not exists google_sub text,
  add column if not exists legal_accepted_at timestamptz;

comment on column public.customer_portal_access.google_sub is
  'Google subject (user id) linked to this portal account. Unique per organization.';

comment on column public.customer_portal_access.legal_accepted_at is
  'When the client accepted Terms and Privacy for this portal account.';

create unique index if not exists customer_portal_access_org_google_sub_uidx
  on public.customer_portal_access (organization_id, google_sub)
  where google_sub is not null;

alter table public.portal_auth_events
  drop constraint if exists portal_auth_events_kind_check;

alter table public.portal_auth_events
  add constraint portal_auth_events_kind_check
  check (kind in ('verify_fail', 'forgot_password', 'identify', 'google_oauth'));
