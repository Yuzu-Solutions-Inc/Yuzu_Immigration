# Continuous control monitoring — Yuzu Immigration

**Owner:** Adrien Yvin — privacy@yuzu.solutions  
**Evidence:** GitHub Actions → *Continuous controls* (every PR, every push to `main`, daily 08:00 America/Toronto)  
**Alert:** scheduled failures open or comment on GitHub issue “Continuous control monitoring failed”

A control **passes** only when its automated test is green. Logging (`security_audit_events`) is not this program.

| ID | Control | Automated test | Cadence |
|---|---|---|---|
| CC-01 | Browser env is only `NEXT_PUBLIC_*` | `npm run security:controls` | PR + daily |
| CC-02 | Secrets live in `server-only` modules | same | PR + daily |
| CC-03 | Client components do not import service-role, wrap key, field crypto, or OAuth secret modules | same | PR + daily |
| CC-04 | AES-256-GCM with 16-byte auth tags | same | PR + daily |
| CC-05 | Zoom / Google / Microsoft / Square / Sage tokens persist via private RPCs | same | PR + daily |
| CC-06 | Vercel crons require `CRON_SECRET` (timing-safe Bearer) | same | PR + daily |
| CC-07 | Square / Stripe / Google / Microsoft / Resend webhooks verify signature or channel token | same | PR + daily |
| CC-08 | No live secrets in git or `.env.example` | same | PR + daily |
| CC-09 | `X-Frame-Options: DENY`, `nosniff`, `frame-ancestors 'none'` | same | PR + daily |
| CC-10 | `verify_customer_portal_login` is server-only | same | PR + daily |
| CC-11 | Append-only `security_audit_events` module exists | same | PR + daily |
| CC-12 | Service-role key is not read from client modules | same | PR + daily |
| CC-13 | SAST (Semgrep OWASP Top 10 + TypeScript + Next.js) | workflow job `sast` | PR + daily |
| CC-14 | Production npm dependencies have no high/critical advisories | `npm audit --omit=dev --audit-level=high` | PR + daily |
| CC-15 | TypeScript strict build (`npm run typecheck`) | workflow job `types` | PR + daily |
| CC-16 | Dependency version drift | Dependabot weekly PRs | weekly |

## Manual (not claimed as automated)

Configure once, then confirm they still hold during the annual review:

- Supabase org MFA and leaked-password protection  
- Vercel / Supabase alerts to privacy@yuzu.solutions  
- GitHub secret scanning on this private repo  

## How to run locally

```bash
npm run security:controls
```

Do not answer “Yes” to continuous control monitoring unless this workflow is green on `main`.
