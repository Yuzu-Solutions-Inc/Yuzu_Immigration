# MyConsultant

Canadian immigration consultant CRM by Yuzu Solutions.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Supabase (Auth, Postgres, Storage) + Drizzle ORM
- TanStack Query, React Hook Form, Zod
- next-intl (`en` / `fr`)

## Setup

1. Copy `.env.example` → `.env.local` and fill Supabase + database values.
2. `npm install`
3. `npm run dev` → [http://localhost:3000](http://localhost:3000)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local app |
| `npm run build` | Production build |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema to Postgres |
| `npm run db:studio` | Drizzle Studio |

## Security

- Secrets live only in `.env.local` (gitignored).
- Service role key is server-only (`src/lib/supabase/admin.ts`).
- Tenant isolation via RLS on `organizations` / members / `customers`.
- Customer portal password hashes live in `private.customer_portal_secrets` (not Data-API readable).
- Portal login RPC is service-role only — call from Next.js server actions, never the browser.

## Auth plan

| Actor | Method |
|-------|--------|
| Staff (org users) | Supabase Auth: **email/password** or **Google** |
| Customers (portal) | `access_code` or link (`access_token`) + password |

Enable Google under Supabase Dashboard → Authentication → Providers.
Add redirect URL: `http://localhost:3000/auth/callback` (and production URL later).

## Repo

https://github.com/Yuzu-Solutions-Inc/MyConsultant
