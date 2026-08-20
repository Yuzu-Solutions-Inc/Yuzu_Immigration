import { cookies } from "next/headers";

import {
  PORTAL_GOOGLE_AAD,
  type PortalGoogleIdentity,
} from "@/lib/google/portal-oauth";
import {
  findPortalMatches,
  labelPortalPerson,
  lookupPortalAccess,
  openPortalAccount,
  type PortalAccessRow,
  type PortalEmailMatch,
} from "@/lib/portal/auth";
import { PORTAL_LEGAL_ACCEPT_COOKIE } from "@/lib/legal/acceptance";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { normalizeGuestEmail } from "@/lib/security/email-lookup";
import { createServiceClient } from "@/lib/supabase/admin";

export const PORTAL_GOOGLE_OAUTH_COOKIE = "mc_portal_google_oauth";
export const PORTAL_GOOGLE_PENDING_COOKIE = "mc_portal_google_pending";
const PENDING_MAX_MS = 10 * 60 * 1000;

export type PortalGooglePending = PortalGoogleIdentity & {
  locale: string;
  exp: number;
  personId?: string;
  organizationId?: string;
  token?: string;
};

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setPortalGoogleOAuthNonce(nonce: string) {
  const store = await cookies();
  store.set(PORTAL_GOOGLE_OAUTH_COOKIE, nonce, {
    ...cookieBase(),
    maxAge: Math.floor(PENDING_MAX_MS / 1000),
  });
}

export async function readPortalGoogleOAuthNonce() {
  const store = await cookies();
  return store.get(PORTAL_GOOGLE_OAUTH_COOKIE)?.value ?? null;
}

export async function clearPortalGoogleOAuthNonce() {
  const store = await cookies();
  store.delete(PORTAL_GOOGLE_OAUTH_COOKIE);
}

export async function setPortalGooglePending(pending: PortalGooglePending) {
  const store = await cookies();
  store.set(
    PORTAL_GOOGLE_PENDING_COOKIE,
    encryptField(JSON.stringify(pending), PORTAL_GOOGLE_AAD.pending),
    {
      ...cookieBase(),
      maxAge: Math.floor(PENDING_MAX_MS / 1000),
    },
  );
}

export async function readPortalGooglePending(): Promise<PortalGooglePending | null> {
  const store = await cookies();
  const value = store.get(PORTAL_GOOGLE_PENDING_COOKIE)?.value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      decryptField(value, PORTAL_GOOGLE_AAD.pending),
    ) as PortalGooglePending;
    if (!parsed.email || !parsed.googleSub || !parsed.locale) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPortalGooglePending() {
  const store = await cookies();
  store.delete(PORTAL_GOOGLE_PENDING_COOKIE);
}

export async function findPortalGoogleMatches(
  identity: PortalGoogleIdentity,
): Promise<PortalEmailMatch[]> {
  const admin = createServiceClient();
  const linkedPersonByOrg = new Map<string, string>();

  const { data: linkedRows, error } = await admin
    .from("customer_portal_access")
    .select("person_id, organization_id, is_active")
    .eq("google_sub", identity.googleSub);
  if (error) {
    console.error("findPortalGoogleMatches sub:", error.message);
  }

  const byKey = new Map<string, PortalEmailMatch>();

  for (const row of linkedRows ?? []) {
    if (row.is_active === false) continue;
    const personId = String(row.person_id);
    const organizationId = String(row.organization_id);
    linkedPersonByOrg.set(organizationId, personId);
    const labeled = await labelPortalPerson(personId, organizationId);
    if (!labeled?.googleLoginEnabled) continue;
    byKey.set(`${personId}:${organizationId}`, labeled);
  }

  for (const match of await findPortalMatches(identity.email)) {
    if (!match.googleLoginEnabled) continue;
    const bound = linkedPersonByOrg.get(match.organizationId);
    if (bound && bound !== match.personId) continue;
    byKey.set(`${match.personId}:${match.organizationId}`, match);
  }

  return [...byKey.values()];
}

export function googleEmailMatchesExpected(
  googleEmail: string,
  expectedEmail: string | undefined,
) {
  if (!expectedEmail) return true;
  return (
    normalizeGuestEmail(googleEmail) === normalizeGuestEmail(expectedEmail)
  );
}

export async function portalNeedsLegalConsent(access: PortalAccessRow) {
  return !access.legal_accepted_at;
}

export async function consumePortalLegalPreAccept() {
  const store = await cookies();
  const accepted = store.get(PORTAL_LEGAL_ACCEPT_COOKIE)?.value === "1";
  store.delete(PORTAL_LEGAL_ACCEPT_COOKIE);
  return accepted;
}

export async function resolvePortalGoogleAccess(
  identity: PortalGoogleIdentity,
  selected: { personId: string; organizationId: string },
  token?: string,
): Promise<PortalAccessRow | "disabled" | null> {
  const matches = await findPortalGoogleMatches(identity);
  const match = matches.find(
    (row) =>
      row.personId === selected.personId &&
      row.organizationId === selected.organizationId,
  );
  if (!match) return null;

  if (token) {
    const access = await lookupPortalAccess(token);
    if (!access || !access.is_active) return null;
    if (access.person_id !== selected.personId) return null;
    if (access.organization_id !== selected.organizationId) return null;
    if (access.google_sub && access.google_sub !== identity.googleSub) {
      return null;
    }
    return access;
  }

  const access = await openPortalAccount(selected.personId);
  if (!access || access.organization_id !== selected.organizationId) return null;
  if (!access.is_active) return "disabled";
  if (access.google_sub && access.google_sub !== identity.googleSub) return null;
  return access;
}

export async function markPortalGoogleLogin(
  access: PortalAccessRow,
  googleSub: string,
  legalAccepted: boolean,
) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const patch: Record<string, string> = {
    google_sub: googleSub,
    last_authenticated_at: now,
    updated_at: now,
  };
  if (legalAccepted && !access.legal_accepted_at) {
    patch.legal_accepted_at = now;
  }
  const { error } = await admin
    .from("customer_portal_access")
    .update(patch)
    .eq("id", access.id);
  if (error) {
    console.error("markPortalGoogleLogin:", error.message);
    throw new Error("save_failed");
  }
}

export async function markPortalLegalAccepted(access: PortalAccessRow) {
  if (access.legal_accepted_at) return;
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("customer_portal_access")
    .update({
      legal_accepted_at: now,
      updated_at: now,
    })
    .eq("id", access.id);
  if (error) console.error("markPortalLegalAccepted:", error.message);
}
