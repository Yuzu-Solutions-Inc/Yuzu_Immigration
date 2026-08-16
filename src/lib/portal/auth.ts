import { createHmac } from "node:crypto";

import { getRequestClientIp } from "@/lib/booking/abuse";
import {
  clearPortalSessionCookie,
  PORTAL_SESSION_COOKIE,
  readPortalSessionCookie,
  setPortalSessionCookie,
  type PortalAccessState,
  type PortalSession,
} from "@/lib/portal/session";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { decryptPersonRow } from "@/lib/security/client-pii";
import {
  hashPortalEmail,
  normalizeGuestEmail,
} from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type { PortalAccessState, PortalSession };

export type PortalAccessRow = {
  id: string;
  person_id: string;
  organization_id: string;
  access_code: string;
  access_token: string;
  is_active: boolean;
  expires_at: string | null;
  last_authenticated_at: string | null;
};

const VERIFY_FAIL_LIMIT = 10;
const VERIFY_FAIL_WINDOW_SEC = 15 * 60;
const FORGOT_PER_ACCESS_PER_DAY = 3;
const FORGOT_PER_IP_PER_DAY = 8;
const IDENTIFY_PER_EMAIL_WINDOW = 10;
const IDENTIFY_PER_IP_WINDOW = 30;
const IDENTIFY_WINDOW_SEC = 15 * 60;

function hashAccessId(accessId: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`portal-access:${accessId.trim().toLowerCase()}`)
    .digest("hex");
}

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`portal-ip:${ip}`)
    .digest("hex");
}

function agoIso(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function asAccessRow(data: unknown): PortalAccessRow | null {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.person_id !== "string") {
    return null;
  }
  return {
    id: row.id,
    person_id: row.person_id,
    organization_id: String(row.organization_id),
    access_code: String(row.access_code),
    access_token: String(row.access_token),
    is_active: row.is_active !== false,
    expires_at: (row.expires_at as string | null) ?? null,
    last_authenticated_at: (row.last_authenticated_at as string | null) ?? null,
  };
}

function sessionFromAccess(row: PortalAccessRow): PortalSession {
  return {
    accessId: row.id,
    personId: row.person_id,
    organizationId: row.organization_id,
    accessCode: row.access_code,
    accessToken: row.access_token,
  };
}

export function portalBaseUrl(base: string, locale: string) {
  return `${base.replace(/\/$/, "")}/${locale}/portal`;
}

export function portalUrl(base: string, locale: string, accessToken: string) {
  return `${base.replace(/\/$/, "")}/${locale}/portal/${accessToken}`;
}

export type PortalEmailMatch = {
  personId: string;
  organizationId: string;
  organizationName: string;
  personLabel: string;
};

export async function findPortalMatches(
  email: string,
): Promise<PortalEmailMatch[]> {
  const trimmed = normalizeGuestEmail(email);
  if (!trimmed.includes("@")) return [];
  let hash: string;
  try {
    hash = hashPortalEmail(trimmed, requireAppEncryptionKey());
  } catch (err) {
    console.error("findPortalMatches hash:", err);
    return [];
  }

  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from("people")
    .select("id, organization_id, first_name, last_name")
    .eq("portal_email_hash", hash);
  if (error) {
    console.error("findPortalMatches:", error.message);
    return [];
  }
  if (!rows?.length) return [];

  const orgIds = [
    ...new Set(rows.map((row) => String(row.organization_id))),
  ];
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", orgIds);
  const orgName = new Map(
    (orgs ?? []).map((org) => [String(org.id), String(org.name ?? "")]),
  );

  const matches: PortalEmailMatch[] = [];
  for (const row of rows) {
    const organizationId = String(row.organization_id);
    const person = decryptPersonRow(
      {
        first_name: row.first_name as string,
        last_name: row.last_name as string,
      },
      await getOrgDataKey(organizationId),
    );
    matches.push({
      personId: String(row.id),
      organizationId,
      organizationName: orgName.get(organizationId) || "",
      personLabel: `${person.first_name} ${person.last_name}`.trim(),
    });
  }
  return matches;
}

export async function openPortalAccount(
  personId: string,
): Promise<PortalAccessRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("client_open_customer_portal", {
    p_person_id: personId,
  });
  if (error) {
    console.error("client_open_customer_portal:", error.message);
    return null;
  }
  return asAccessRow(data);
}

export async function resolvePortalAccount(
  email: string,
  personId: string,
  organizationId: string,
): Promise<PortalAccessRow | "disabled" | null> {
  const match = (await findPortalMatches(email)).find(
    (row) =>
      row.personId === personId && row.organizationId === organizationId,
  );
  if (!match) return null;
  const access = await openPortalAccount(personId);
  if (!access || access.organization_id !== organizationId) return null;
  if (!access.is_active) return "disabled";
  return access;
}

export async function lookupPortalAccess(
  accessId: string,
): Promise<PortalAccessRow | null> {
  const trimmed = accessId.trim();
  if (!trimmed) return null;
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("lookup_customer_portal_access", {
    p_access_id: trimmed,
  });
  if (error) {
    console.error("lookup_customer_portal_access:", error.message);
    return null;
  }
  return asAccessRow(data);
}

export async function portalPasswordExists(accessId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("customer_portal_password_exists", {
    p_access_id: accessId.trim(),
  });
  if (error) {
    console.error("customer_portal_password_exists:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function setPortalPassword(
  accessId: string,
  password: string,
): Promise<"ok" | "already_set" | "invalid" | "invalid_password"> {
  const admin = createServiceClient();
  try {
    const { data, error } = await admin.rpc(
      "client_set_customer_portal_password",
      {
        p_access_id: accessId.trim(),
        p_password: password,
      },
    );
    if (error) {
      if (error.message.includes("invalid_password")) return "invalid_password";
      if (error.message.includes("password_already_set")) return "already_set";
      console.error("client_set_customer_portal_password:", error.message);
      return "invalid";
    }
    return data ? "ok" : "invalid";
  } catch (err) {
    console.error("setPortalPassword:", err);
    return "invalid";
  }
}

export async function verifyPortalLogin(
  accessId: string,
  password: string,
): Promise<PortalAccessRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("verify_customer_portal_login", {
    p_access_id: accessId.trim(),
    p_password: password,
  });
  if (error) {
    console.error("verify_customer_portal_login:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const verified = row as {
    customer_id?: string;
    organization_id?: string;
    access_token?: string;
    access_code?: string;
  };
  if (!verified.customer_id || !verified.organization_id) return null;
  const access = await lookupPortalAccess(
    verified.access_token || verified.access_code || accessId,
  );
  return access;
}

export async function resetPortalPassword(
  accessId: string,
): Promise<PortalAccessRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("reset_customer_portal_password", {
    p_access_id: accessId.trim(),
  });
  if (error) {
    console.error("reset_customer_portal_password:", error.message);
    return null;
  }
  return asAccessRow(data);
}

async function countAuthEvents(input: {
  organizationId?: string | null;
  accessHash?: string | null;
  kind: "verify_fail" | "forgot_password" | "identify";
  ipHash?: string | null;
  sinceIso: string;
}) {
  const admin = createServiceClient();
  let query = admin
    .from("portal_auth_events")
    .select("id", { count: "exact", head: true })
    .eq("kind", input.kind)
    .gte("created_at", input.sinceIso);
  if (input.organizationId) {
    query = query.eq("organization_id", input.organizationId);
  }
  if (input.accessHash) query = query.eq("access_hash", input.accessHash);
  if (input.ipHash) query = query.eq("ip_hash", input.ipHash);
  const { count, error } = await query;
  if (error) {
    console.error("portal_auth_events count:", error.message);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

async function recordAuthEvent(input: {
  organizationId?: string | null;
  accessHash: string;
  kind: "verify_fail" | "forgot_password" | "identify";
  ipHash?: string | null;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("portal_auth_events").insert({
    organization_id: input.organizationId ?? null,
    access_hash: input.accessHash,
    kind: input.kind,
    ip_hash: input.ipHash ?? null,
  });
  if (error) console.error("portal_auth_events insert:", error.message);
}

export async function checkPortalVerifyRateLimit(
  access: PortalAccessRow,
): Promise<"ok" | "rate_limited"> {
  const count = await countAuthEvents({
    organizationId: access.organization_id,
    accessHash: hashAccessId(access.id),
    kind: "verify_fail",
    sinceIso: agoIso(VERIFY_FAIL_WINDOW_SEC),
  });
  return count >= VERIFY_FAIL_LIMIT ? "rate_limited" : "ok";
}

export async function checkPortalForgotRateLimit(
  access: PortalAccessRow,
  ipHash: string | null,
): Promise<"ok" | "rate_limited"> {
  const day = agoIso(24 * 60 * 60);
  const accessHash = hashAccessId(access.id);
  const [accessDay, ipDay] = await Promise.all([
    countAuthEvents({
      organizationId: access.organization_id,
      accessHash,
      kind: "forgot_password",
      sinceIso: day,
    }),
    ipHash
      ? countAuthEvents({
          organizationId: access.organization_id,
          accessHash,
          kind: "forgot_password",
          ipHash,
          sinceIso: day,
        })
      : Promise.resolve(0),
  ]);
  if (accessDay >= FORGOT_PER_ACCESS_PER_DAY) return "rate_limited";
  if (ipDay >= FORGOT_PER_IP_PER_DAY) return "rate_limited";
  return "ok";
}

export async function recordPortalVerifyFailure(access: PortalAccessRow) {
  const ip = await getRequestClientIp();
  await recordAuthEvent({
    organizationId: access.organization_id,
    accessHash: hashAccessId(access.id),
    kind: "verify_fail",
    ipHash: ip ? hashIp(ip) : null,
  });
}

export async function recordPortalForgotPassword(access: PortalAccessRow) {
  const ip = await getRequestClientIp();
  await recordAuthEvent({
    organizationId: access.organization_id,
    accessHash: hashAccessId(access.id),
    kind: "forgot_password",
    ipHash: ip ? hashIp(ip) : null,
  });
}

function hashPortalIdentifyEmail(email: string) {
  return hashPortalEmail(email, requireAppEncryptionKey());
}

export async function checkPortalIdentifyRateLimit(
  email: string,
  ipHash: string | null,
): Promise<"ok" | "rate_limited"> {
  let emailHash: string;
  try {
    emailHash = hashPortalIdentifyEmail(email);
  } catch {
    return "ok";
  }
  const since = agoIso(IDENTIFY_WINDOW_SEC);
  const [emailCount, ipCount] = await Promise.all([
    countAuthEvents({
      accessHash: emailHash,
      kind: "identify",
      sinceIso: since,
    }),
    ipHash
      ? countAuthEvents({
          kind: "identify",
          ipHash,
          sinceIso: since,
        })
      : Promise.resolve(0),
  ]);
  if (emailCount >= IDENTIFY_PER_EMAIL_WINDOW) return "rate_limited";
  if (ipCount >= IDENTIFY_PER_IP_WINDOW) return "rate_limited";
  return "ok";
}

export async function recordPortalIdentifyAttempt(email: string) {
  const ip = await getRequestClientIp();
  let emailHash: string;
  try {
    emailHash = hashPortalIdentifyEmail(email);
  } catch {
    return;
  }
  await recordAuthEvent({
    accessHash: emailHash,
    kind: "identify",
    ipHash: ip ? hashIp(ip) : null,
  });
}

export async function getPortalAccessState(
  accessId: string,
): Promise<{ access: PortalAccessRow; state: PortalAccessState } | null> {
  const access = await lookupPortalAccess(accessId);
  if (!access) return null;
  const hasPassword = await portalPasswordExists(
    access.access_token || access.access_code,
  );
  if (!hasPassword) {
    return { access, state: "needs_password_setup" };
  }

  const cookie = await readPortalSessionCookie();
  if (
    cookie &&
    cookie.accessId === access.id &&
    cookie.personId === access.person_id &&
    cookie.organizationId === access.organization_id
  ) {
    return { access, state: "authenticated" };
  }
  return { access, state: "needs_password_login" };
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookie = await readPortalSessionCookie();
  if (!cookie) return null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("customer_portal_access")
    .select(
      "id, person_id, organization_id, access_code, access_token, is_active, expires_at",
    )
    .eq("id", cookie.accessId)
    .eq("person_id", cookie.personId)
    .eq("organization_id", cookie.organizationId)
    .maybeSingle();

  if (error) {
    console.error("getPortalSession:", error.message);
    return null;
  }
  const row = asAccessRow(data);
  if (!row || !row.is_active) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;
  return sessionFromAccess(row);
}

export async function assertPortalSession(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) throw new Error("auth_required");
  return session;
}

export async function assertPortalProjectAccess(
  session: PortalSession,
  projectId: string,
): Promise<void> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("project_participants")
    .select("id")
    .eq("project_id", projectId)
    .eq("person_id", session.personId)
    .eq("organization_id", session.organizationId)
    .is("left_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("forbidden");
}

export async function establishPortalSession(access: PortalAccessRow) {
  await setPortalSessionCookie(sessionFromAccess(access));
}

export { clearPortalSessionCookie, PORTAL_SESSION_COOKIE };
