-- Outbound Resend messages and bounce/complaint suppressions.
-- Recipient addresses are HMAC hashes (DOCUMENT_ENCRYPTION_KEY), never plaintext.

create table public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  kind text not null,
  idempotency_key text not null,
  resend_email_id text,
  to_hash text not null,
  status text not null default 'sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_emails_status_chk
    check (status in (
      'sent',
      'delivered',
      'bounced',
      'complained',
      'failed',
      'delayed',
      'suppressed'
    )),
  constraint outbound_emails_idempotency_key_key unique (idempotency_key)
);

comment on table public.outbound_emails is
  'Resend send log. to_hash is HMAC of the recipient; resend_email_id maps webhook events.';

create unique index outbound_emails_resend_email_id_uidx
  on public.outbound_emails (resend_email_id)
  where resend_email_id is not null;

create index outbound_emails_org_created_idx
  on public.outbound_emails (organization_id, created_at desc);

create table public.email_suppressions (
  email_hash text primary key,
  reason text not null,
  resend_email_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_suppressions_reason_chk
    check (reason in ('bounced', 'complained'))
);

comment on table public.email_suppressions is
  'Hard-bounce and spam-complaint suppressions. email_hash is HMAC of the address.';

alter table public.outbound_emails enable row level security;
alter table public.email_suppressions enable row level security;

revoke all on table public.outbound_emails from public, anon, authenticated;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant select, insert, update on table public.outbound_emails to service_role;
grant select, insert, update on table public.email_suppressions to service_role;
