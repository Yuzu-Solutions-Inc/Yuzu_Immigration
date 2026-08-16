# Yuzu Immigration

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

Staff Google **sign-in** is separate from **Calendar sync**. Each staff member connects one calendar (Google **or** Outlook) and one meeting tool (Google Meet, Teams, **or** Zoom) independently under **Settings → Calendar**. Calendar events block public slots; the meeting tool supplies the join link.

- Google Calendar / Meet: Google Cloud OAuth client, Calendar API + Meet API, `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET`, redirect `{APP_URL}/auth/google-calendar/callback`. Push notifications require HTTPS (they will not arrive on localhost).
- Outlook / Teams: Entra ID app with `Calendars.ReadWrite` and `OnlineMeetings.ReadWrite`, `MICROSOFT_CALENDAR_CLIENT_ID` / `MICROSOFT_CALENDAR_CLIENT_SECRET`, redirect `{APP_URL}/auth/microsoft-calendar/callback`.
- Zoom: Zoom Marketplace General app with meeting write/update/delete and user read scopes, `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`, redirect `{APP_URL}/auth/zoom/callback`.

Booking confirmation emails use Resend. Set `RESEND_API_KEY` and `BOOKING_FROM_EMAIL` (a verified domain, e.g. `Yuzu Immigration <bookings@yourdomain.com>`).

## Repo

https://github.com/Yuzu-Solutions-Inc/Yuzu_Immigration
