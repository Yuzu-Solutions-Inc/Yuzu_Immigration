-- Applied remotely via Supabase MCP to project cezwtrsleuubrfmbhosn
-- Migrations: org_user_customer_foundation, enable_rls_portal_secrets, harden_security_definer_grants
-- This file is a reference snapshot for the repo (source of truth is remote migration history).

-- Model:
--   organizations
--   profiles (auth.users)
--   organization_members (owner|admin|member) — all members see all org data for now
--   customers
--   customer_portal_access (access_code + access_token)
--   private.customer_portal_secrets (bcrypt hash; RLS on, no policies = deny Data API)

-- Staff auth: Supabase Auth email/password + Google (enable Google in dashboard)
-- Customer portal: access_code|access_token + password via set_customer_portal_password
-- Portal verify: verify_customer_portal_login — service_role / Next.js server only
