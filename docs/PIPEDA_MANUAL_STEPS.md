# PIPEDA / CICC — Manual Steps Checklist

Automated product and database work for Phases 0–3 is in the repo and on `main`.  
This file lists **everything that still requires a human** (dashboard clicks, legal review, ops process).

> Not legal advice. Have counsel review privacy policy, DPA, and breach procedures before making compliance claims to customers.

---

## Phase 0 — Platform security (manual)

### Supabase Auth
- [ ] Enable **Leaked password protection** (HaveIBeenPwned)  
  Dashboard → Authentication → Providers / Attack Protection → leaked password protection  
  Docs: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- [ ] Confirm password minimum length ≥ 8 (app) / portal ≥ 10 (RPC)
- [ ] Enable **MFA** for all Supabase organization members who can access the project dashboard  
  Dashboard → Organization → Security → enforce MFA
- [ ] Optionally enable MFA for end-user (staff) Auth when ready (TOTP) — product UI not shipped yet

### Supabase project hardening
- [ ] Confirm project region is **Canada Central (`ca-central-1`)** — already set for MyConsultant; verify after any restore/transfer
- [ ] Enable **SSL enforcement** for database connections  
  Dashboard → Database → Settings → SSL enforcement
- [ ] Enable **Network restrictions** if you have stable egress IPs for admin/ops
- [ ] Enable **Point-in-Time Recovery (PITR)** (Team plan + compute add-on as required)
- [ ] Review **Security Advisor** after each migration and clear remaining WARN/ERROR items  
  Dashboard → Database → Security Advisor  
  Note: `is_org_member` remaining as callable by `authenticated` is intentional for RLS
- [ ] Rotate any keys that may have been shared in chat or screenshots (`service_role`, `DOCUMENT_ENCRYPTION_KEY`)

### Secrets & env
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `DOCUMENT_ENCRYPTION_KEY` only in `.env.local` / Vercel encrypted env — never in `NEXT_PUBLIC_*`
- [ ] Generate a strong 32-byte hex `DOCUMENT_ENCRYPTION_KEY` for production and store in a password manager + Vercel
- [ ] Document key-rotation procedure (re-encrypt documents or dual-key window) before first production clients

---

## Phase 1 — Legal & transparency (manual)

### Documents to finalize with counsel
- [ ] Review public Privacy Policy at `/[locale]/privacy` (copy lives in `messages/*/legal`)
- [ ] Replace placeholder contact `privacy@yuzusolutions.ca` with the real monitored inbox (code + DNS + mailbox)
- [ ] Finalize and execute **Firm Data Processing Addendum**  
  Template: [`docs/templates/firm-data-processing-addendum.md`](templates/firm-data-processing-addendum.md)
- [ ] Publish a short **security / subprocessors** page or PDF for firm due diligence (Supabase, Vercel, email provider, etc.)
- [ ] Sign **Supabase DPA**  
  https://supabase.com/legal/dpa
- [ ] Download **Supabase SOC 2 Type 2** report (Team/Enterprise) and store in your vendor due-diligence folder  
  Dashboard → Organization → Legal Documents

### Firm onboarding process
- [ ] Require signed DPA (or equivalent) before production client PII is loaded
- [ ] Train RCICs that **they** remain controllers for client files and must obtain meaningful consent under PIPEDA / provincial rules
- [ ] If selling to **Québec** firms: plan Law 25 PIAs / transfer assessments for any processing outside Québec

---

## Phase 2 — Access control & monitoring (manual)

### Roles inside each firm
- [ ] Assign correct `organization_members.role` values (`admin` / `consultant` / `assistant`)
- [ ] Ensure at least one `admin` per firm
- [ ] Invite staff from **Settings → Organization** (email + role). Add `/auth/callback` and `/{locale}/invite/*` to the Supabase Auth redirect allow list, and enable Auth invite emails
- [ ] Share projects with assistants from the project page so they can see those files

### Operational monitoring
- [ ] Review **Settings → Security** audit log weekly during early production
- [ ] Configure Vercel / Supabase alerts for failed auth spikes and unusual RPC errors
- [ ] Restrict who has GitHub admin, Vercel production, and Supabase dashboard access (least privilege)

### Optional product follow-ups (not yet built)
- [ ] Staff MFA enrollment UI in-app
- [ ] Project-scoped assistant sharing (built: share a project with assistants from the project page)
- [ ] Field-level encryption for passport/SIN-like columns (documents already AES-256-GCM)

---

## Phase 3 — Retention, destruction, individual rights (manual)

### Firm practice policy
- [ ] Document each firm’s retention schedule (default product: **closed_at + 6 years**)
- [ ] Align retainer language with CICC Client File Management Regulation (return of client property, closed-file notice, destruction register)
- [ ] Define who may approve secure destruction (`admin` only in product)

### Using the product
- [ ] When a file reaches terminal status (`granted` / `rejected`), confirm `closed_at` and `retain_until` appear on the project
- [ ] After retain-until, use **Destroy sensitive content** only with typed `DESTROY` confirmation
- [ ] Keep the **destruction register** (Settings → Security) for College audits
- [ ] For PIPEDA access requests: use **Export data** on the person page (admins); fulfill document plaintext requests carefully and log the request offline if needed

### Backups
- [ ] Understand that PITR/backups may retain ciphertext/metadata beyond application-level destroy until backup expiry — document this in the firm DPA / privacy notice

---

## Phase 4 — Prove & maintain (manual / recurring)

### Incident response
- [ ] Appoint a **privacy contact** for Yuzu Solutions
- [ ] Maintain a written **breach runbook**: detect → contain → assess “real risk of significant harm” → notify OPC + affected individuals/firms → remediate → post-mortem
- [ ] Run a **tabletop breach exercise** at least annually
- [ ] Keep a breach register (even for near-misses)

### Annual / recurring
- [ ] Refresh Supabase SOC 2 report annually room annually
- [ ] Re-review subprocessors and privacy policy “Last updated” date
- [ ] Re-run Security Advisor + dependency audits before major releases
- [ ] Confirm Canada residency still applies to primary DB, Auth, and Storage (and any new add-ons)

### Marketing claims
- [ ] Prefer “designed to support PIPEDA accountability and CICC file-management duties” over “PIPEDA certified” (no such certification exists)
- [ ] Do not claim HIPAA unless you intentionally enable Supabase HIPAA add-on + BAA (usually unnecessary for immigration CRM)

---

## Already implemented in code (reference)

| Phase | Shipped |
|---|---|
| 0 | Privileged RPCs locked to `service_role` + explicit actor; `is_org_role` helper; RBAC helpers |
| 1 | `/privacy` page; low-key Privacy links (landing, login, sidebar); client consent notices on fill flows; firm DPA template |
| 2 | `security_audit_events`; audit on downloads/uploads/share links/org/person delete; admin-only org update & person delete (RLS + app) |
| 3 | `retain_until` (+6y on close); secure destroy + `file_destruction_register`; person JSON export; Security settings UI |

Region: **`ca-central-1`**. Document encryption: **AES-256-GCM** via `DOCUMENT_ENCRYPTION_KEY`.

---

## Quick links

- Privacy policy (app): `/en/privacy`, `/fr/privacy`, `/es/privacy`
- Security settings (staff admin): `/[locale]/settings/security`
- Firm DPA template: `docs/templates/firm-data-processing-addendum.md`
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- OPC PIPEDA guidance: https://www.priv.gc.ca/
- CICC Code / file management: https://college-ic.ca/
