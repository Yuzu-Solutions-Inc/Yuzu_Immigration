-- Hashed public-booking rate-limit events. No raw emails or IPs.
create table public.booking_abuse_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  email_hash text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint booking_abuse_events_kind_chk
    check (kind in ('book_attempt', 'book_success', 'manage_links'))
);

comment on table public.booking_abuse_events is
  'Public booking anti-abuse log. Subjects are HMAC hashes; never store plaintext email or IP.';

create index booking_abuse_events_org_kind_email_created_idx
  on public.booking_abuse_events (organization_id, kind, email_hash, created_at desc);

create index booking_abuse_events_org_kind_ip_created_idx
  on public.booking_abuse_events (organization_id, kind, ip_hash, created_at desc);

create index booking_abuse_events_created_idx
  on public.booking_abuse_events (created_at);

alter table public.booking_abuse_events enable row level security;

revoke all on table public.booking_abuse_events from public, anon, authenticated;
grant select, insert, delete on table public.booking_abuse_events to service_role;
