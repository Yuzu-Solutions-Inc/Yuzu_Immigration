# Dossierly family CRM — handoff plan (2026-09-06)

This is the source of truth for the next chat. Previous work lived in OneDrive `yuzu_finance` and a Cursor plan named “CRM platform merge”. **Do not continue in OneDrive.** Work only here.

---

## Workspace and remotes

| What | Path / id |
|---|---|
| **Sandbox (this repo)** | `/Users/adrienyvin/YUZU Solutions Inc/yuzu_crm` |
| **Production Immigration (DO NOT EDIT / DO NOT PUSH)** | `/Users/adrienyvin/YUZU Solutions Inc/yuzu_my_consultant` → `dossierly.ca` / Vercel `my-consultant` |
| **Old Finance git (OneDrive, slow — read if needed)** | `/Users/adrienyvin/Library/CloudStorage/OneDrive-Personal/YUZU.Solutions/yuzu_finance` |
| Git remote in this repo | `immigration` → `https://github.com/Yuzu-Solutions-Inc/Yuzu_Immigration.git` (**no `origin`** — do not `git push` here) |
| Finance snapshot | `app-legacy/` (clone of `Yuzu-Solutions-Inc/yuzu_finance` `main`, **gitignored**, no `node_modules`) |
| Local branch | `yuzu-crm` |

This sandbox **is** Dossierly (Immigration `main` checked out). Finance Vite app is only a source tree under `app-legacy/`.

---

## Supabase (critical)

| Project | Ref | Use |
|---|---|---|
| **Yuzu Solutions Inc.** | `gqpafbmlherrwuigsjxy` | Local `.env.local` and Vercel Preview / Development. |
| **MyConsultant** | `cezwtrsleuubrfmbhosn` | Vercel Production (`dossierly.ca`). Do not migrate/drop here from this sandbox branch. |

App env (create `.env.local`, gitignored):

- `NEXT_PUBLIC_SUPABASE_URL=https://gqpafbmlherrwuigsjxy.supabase.co`
- This project’s anon / publishable key
- **New** `DOCUMENT_ENCRYPTION_KEY` for this project — do **not** reuse MyConsultant’s wrap key
- Vercel Production env is scoped separately to MyConsultant; Preview is scoped to this project.

`organization_modules` is **already applied** on Yuzu Solutions Inc. Existing org seeded with: `finance`, `bookings`, `services`, `contracts`, `payments` (no `immigration`).

---

## Locked product decisions

- **Brand:** Dossierly everywhere. Module names: Dossierly Finance / Immigration / Bookings / Services / Contracts / Payments.
- **One Next.js app**, org-level module checkboxes (signup + owner/admin Settings → Modules). Core always on.
- **UI:** full Dossierly design system including **graphite/indigo palette**, Plus Jakarta + Inter, Field / NativeSelect / FormStack. **No Yuzu gold.**
- **Routes:** `/[locale]/partners` (never canonical `/clients`). Finance work: `/[locale]/billing/projects`. Locale prefix `en` \| `fr` (`es` exists from Immigration copy).
- **Dashboard:** keep current Yuzu Finance **executive card set** when Finance is on (activity, estimated dues, revenue trend, deadlines, by client / by service).
- **Contacts:** core entity is **`partners`** (`customer` \| `provider` \| `both`). Bookings, contracts, `payment_requests` use `partner_id`. Immigration PII stays in the immigration module (today still `people` — retarget later).
- **Portal:** not in this pass.
- **Roles:** `owner` \| `admin` \| `case_manager` + licensed seats. Map Finance `member` → `case_manager` (UI: Membre / Member). Unlicensed = read-only. Auth FKs **`ON DELETE RESTRICT`**. Never delete Auth users.
- **Stripe vs bank:**
  - Checkout **created from a Finance invoice** → insert `payments` (`source=stripe`) + `recalculateInvoiceStatus`. Banque **links** that row (no second insert).
  - Any other Stripe (booking `/pay`) → `payment_requests` only, **not** invoice AR.
  - Bank line with no matching invoice-Stripe payment → existing “other payment” assign flow.
- **Encryption:** org DEK + AES-GCM for identity, tax IDs, bank **identifiers**. **Money columns stay `numeric`.**
- **Schema:** may be rebuilt (new tables → copy → verify counts → drop old). Data and Storage files must survive. Sauvegarde ZIP first.
- **Integrations v1:** Resend, Google login, Google Calendar + Meet, Stripe Connect + SaaS seats. Skip Square, Sage, Microsoft, Zoom unless needed to compile.
- **SaaS seats:** platform, not a module checkbox.

---

## Already done

1. Repo created off OneDrive; Immigration `main` fetched; Finance in `app-legacy/`; `npm install` + `npm run typecheck` green (`app-legacy` excluded from tsconfig).
2. Module catalog: [`src/lib/modules/catalog.ts`](src/lib/modules/catalog.ts), load/save [`src/lib/modules/org-modules.ts`](src/lib/modules/org-modules.ts), [`src/lib/modules/require-module.ts`](src/lib/modules/require-module.ts).
3. SQL: [`supabase/migrations/20260906040000_organization_modules.sql`](supabase/migrations/20260906040000_organization_modules.sql) + Drizzle `organizationModules`.
4. Onboarding checkboxes; Settings → Modules; sidebar gated by modules; Finance placeholders at `/partners` and `/billing/projects`.
5. Session loads `enabledModules` (if table missing → Immigration fallback pack).

**Not done:** `src/modules/{core,finance,...}` folder split (logic still lives in existing Dossierly `src/` plus `src/lib/modules`). Finance screens are placeholders. Bookings still keyed to `people`.

---

## Remaining work (do in order)

### 1. Env + don’t break production

- Local `.env.local` and Vercel Preview/Development use Yuzu Solutions Inc. (`gqpafbmlherrwuigsjxy`).
- Vercel Production uses MyConsultant (`cezwtrsleuubrfmbhosn`) for dossierly.ca.
- Re-add `DATABASE_URL` / `DIRECT_DATABASE_URL` on Vercel (Production from MyConsultant, Preview from Yuzu) from each project’s Connect dialog — those two were not recoverable from local files.
- Never `git push` to `immigration` from this sandbox unless promoting a reviewed production change. Create a new GitHub repo for `yuzu_crm` when the owner wants a separate remote.

### 2. Sauvegarde + schema strategy on Yuzu Solutions Inc.

- Download a backup ZIP from the current Finance app (**Sauvegarde**) before encryption or table drops.
- Snapshot row counts + Storage object counts (`documents` bucket).
- Family schema can replace Finance-shaped tables: create new → copy/transform (keep IDs where possible) → verify → drop old.
- Collisions: both products have `organizations`, `profiles`, `projects`. Extend/backfill; don’t drop until the new app reads the new tables.
- Map Finance `member` → `case_manager`; add Dossierly org columns (wrapped DEK, seats, Stripe SaaS) as needed.
- Keep `auth.users`. Copy Storage before deleting any object.

### 3. Core partners

- Treat `partners` as the CRM contact; add `phone` if missing.
- Retarget bookings / contracts / `payment_requests` from `people` / `immigration_projects` to `partner_id` + Finance `projects.id` where relevant.
- Keep `/clients` as Immigration-only (or redirect when Immigration is off).

### 4. Port Dossierly Finance (parity)

Source: `app-legacy/app/src/` (pages + `lib/`). Restyle with Dossierly UI. **Do not change Québec rules.**

Port:

- Executive dashboard `/` + `/dashboard/details` (same cards)
- Partners, billing (projects, pipeline, time, invoices)
- Bank, compensation (payroll, dividends, shareholders, employees)
- Other hub: sales tax, corp tax, employee expenses, ledger, reports, adjustments, period close, tax exports, compliance, backup
- Settings: company, GST/QST, billing, team, **modules**

Keep logic from: `payrollCalc.ts`, `invoice.ts`, `salesTaxCalc.ts`, `generalLedger.ts`, `financials.ts`, `bankActions.ts`, `fiscalPeriodClose.ts`, backup ZIP. Run GL/dashboard **on the server**.

Gate routes with `requireModule('finance')`. No Finance ↔ Immigration page imports.

### 5. Invoice Stripe + bank

- Invoice UI: “Stripe payment link” creates Checkout with `source=invoice` + `invoice_id`.
- Webhook paid → Finance `payments` + status recalc.
- Banque match of that deposit: **link only**.
- Booking Stripe unchanged (not invoice AR).

### 6. Optional deploy

- Point `app.yuzu.solutions` (Vercel `yuzu-finance`) at this Next.js app when Finance parity is real.
- Leave `dossierly.ca` on `yuzu_my_consultant`.

---

## Module catalog (checkboxes)

Always on: auth, orgs, RBAC, encryption, partners, shell, team.

| id | Name |
|---|---|
| `finance` | Dossierly Finance |
| `immigration` | Dossierly Immigration (off for Yuzu org) |
| `bookings` | Dossierly Bookings |
| `services` | Dossierly Services |
| `contracts` | Dossierly Contracts |
| `payments` | Dossierly Payments |

Payments requires Bookings **and/or** Finance. Disable = hide nav; **keep data**.

---

## Risks

- Accidental `git push` to `immigration` would ship sandbox to production Dossierly GitHub.
- Pointing `.env.local` at MyConsultant would mix products.
- Double cash if Banque inserts a payment Stripe already created from an invoice.
- Encryption key mix-up makes PII unreadable.
- Drop old tables only after counts match.
- Tax/payroll output is **draft for owner/CPA review**.

---

## How to start the next chat

Open `/Users/adrienyvin/YUZU Solutions Inc/yuzu_crm`. Tell the agent: follow `.cursor/plans/dossierly-family-handoff.md`. First task: `.env.local` → Yuzu Solutions Inc., then port Finance from `app-legacy` onto Dossierly UI.
