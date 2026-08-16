# Scale rules (Vercel + Supabase)

Growth horizon: tens of firms, thousands of clients. Keep authenticated CRM data fresh. Do not add Redis or queues unless a measured bottleneck requires them.

## Cache

Cache:

- Marketing / landing (CDN)
- IRCC blank PDFs (in-process after Storage or remote fetch)
- Org-stable reference rows only when tagged and invalidated on write

Never cache:

- People, projects, answers, appointments, documents, notifications
- Authenticated CRM pages (`/home`, `/projects`, `/people`, …)

`cacheComponents` / ISR on CRM routes would either serve stale PII or burn revalidation on every mutation.

## Data access

- Runtime queries go through PostgREST (Supabase JS). Do not open Drizzle / `postgres` sockets from Vercel Functions.
- If SQL is ever required from Functions, use the Supavisor transaction pooler (`:6543`) with `max: 1` per instance. Never point Functions at direct `5432`.
- Encrypted email is looked up via `email_lookup_hash` (HMAC of normalized email + org id). Do not decrypt an org to find one person.
- `search_name` / `search_title` are lowercase search indexes. Ciphertext remains the source of truth.
- Project list/home progress is stored on `immigration_projects` (`docs_*`, `form_percent`). Recompute on form/document writes. Do not select `project_form_answers.answers` on list pages.

## Compute

- Pin Functions to `iad1` (same region as Supabase).
- Stay on Node.js Fluid Compute. Do not set `runtime = 'edge'`.
- PDF / ZIP work may use `maxDuration = 60` on those routes only. Do not raise memory or duration globally.
- IRCC blanks are excluded from the Function trace and loaded from Storage (then local/remote fallback).
- Public pages must not call `auth.getUser()`. Session refresh stays on CRM prefixes only.
- Notifications refresh on window focus / visibility, not on an interval.
- Daily crons filter appointments to a due window. Google sync uses bounded concurrency (3). Prefer the existing Google webhook as the primary sync.

## Observability

Measure before adding more indexes: Vercel function duration / Active CPU, and Supabase Query Performance. Unused-index advisor warnings are expected at low traffic — do not drop org indexes.
