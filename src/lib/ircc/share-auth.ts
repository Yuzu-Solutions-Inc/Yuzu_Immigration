import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

import { getRequestClientIp } from "@/lib/booking/abuse";
import { hashShareToken } from "@/lib/ircc/project-forms";
import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { createServiceClient } from "@/lib/supabase/admin";

export const SHARE_SESSION_COOKIE = "mc_share_session";

export type ShareAccessState =
  | "needs_password_setup"
  | "needs_password_login"
  | "authenticated";

export type ResolvedShareLink = {
  organizationId: string;
  projectId: string;
  linkId: string;
  expiresAt: string;
  tokenHash: string;
};

const VERIFY_FAIL_LIMIT = 10;
const VERIFY_FAIL_WINDOW_SEC = 15 * 60;
const FORGOT_PER_LINK_PER_DAY = 3;
const FORGOT_PER_IP_PER_DAY = 8;

function hashIp(ip: string) {
  return createHmac("sha256", requireAppEncryptionKey())
    .update(`share-ip:${ip}`)
    .digest("hex");
}

function signSessionBody(linkId: string, tokenHash: string, exp: number) {
  const body = `${linkId}:${tokenHash}:${exp}`;
  const sig = createHmac("sha256", requireAppEncryptionKey())
    .update(`share-session:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

function parseSessionCookie(
  value: string,
  expectedTokenHash: string,
  expectedLinkId: string,
): boolean {
  try {
    const dot = value.lastIndexOf(".");
    if (dot < 1) return false;
    const body = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    const parts = body.split(":");
    if (parts.length !== 3) return false;
    const [linkId, tokenHash, expRaw] = parts;
    const exp = Number(expRaw);
    if (
      linkId !== expectedLinkId ||
      tokenHash !== expectedTokenHash ||
      !Number.isFinite(exp) ||
      exp < Date.now()
    ) {
      return false;
    }
    const expected = signSessionBody(linkId, tokenHash, exp);
    return expected === `${body}.${sig}`;
  } catch {
    return false;
  }
}

export async function shareLinkPasswordExists(tokenHash: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("form_share_link_password_exists", {
    p_token_hash: tokenHash,
  });
  if (error) {
    console.error("form_share_link_password_exists:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function setShareLinkPassword(
  tokenHash: string,
  password: string,
): Promise<"ok" | "already_set" | "invalid_link" | "invalid_password"> {
  const admin = createServiceClient();
  try {
    const { data, error } = await admin.rpc("client_set_form_share_link_password", {
      p_token_hash: tokenHash,
      p_password: password,
    });
    if (error) {
      if (error.message.includes("invalid_password")) return "invalid_password";
      if (error.message.includes("password_already_set")) return "already_set";
      console.error("client_set_form_share_link_password:", error.message);
      return "invalid_link";
    }
    return data ? "ok" : "invalid_link";
  } catch (err) {
    console.error("setShareLinkPassword:", err);
    return "invalid_link";
  }
}

export async function verifyShareLinkPassword(
  tokenHash: string,
  password: string,
): Promise<boolean> {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("verify_form_share_link_password", {
    p_token_hash: tokenHash,
    p_password: password,
  });
  if (error) {
    console.error("verify_form_share_link_password:", error.message);
    return false;
  }
  return Boolean(data);
}

async function countAuthEvents(input: {
  organizationId: string;
  tokenHash: string;
  kind: "verify_fail" | "forgot_password";
  ipHash?: string | null;
  sinceIso: string;
}) {
  const admin = createServiceClient();
  let query = admin
    .from("share_link_auth_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId)
    .eq("token_hash", input.tokenHash)
    .eq("kind", input.kind)
    .gte("created_at", input.sinceIso);
  if (input.ipHash) query = query.eq("ip_hash", input.ipHash);
  const { count, error } = await query;
  if (error) {
    console.error("share_link_auth_events count:", error.message);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

async function recordAuthEvent(input: {
  organizationId: string;
  tokenHash: string;
  kind: "verify_fail" | "forgot_password";
  ipHash?: string | null;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("share_link_auth_events").insert({
    organization_id: input.organizationId,
    token_hash: input.tokenHash,
    kind: input.kind,
    ip_hash: input.ipHash ?? null,
  });
  if (error) console.error("share_link_auth_events insert:", error.message);
}

function agoIso(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

export async function checkShareVerifyRateLimit(
  resolved: ResolvedShareLink,
): Promise<"ok" | "rate_limited"> {
  const count = await countAuthEvents({
    organizationId: resolved.organizationId,
    tokenHash: resolved.tokenHash,
    kind: "verify_fail",
    sinceIso: agoIso(VERIFY_FAIL_WINDOW_SEC),
  });
  return count >= VERIFY_FAIL_LIMIT ? "rate_limited" : "ok";
}

export async function checkShareForgotRateLimit(
  resolved: ResolvedShareLink,
  ipHash: string | null,
): Promise<"ok" | "rate_limited"> {
  const day = agoIso(24 * 60 * 60);
  const [linkDay, ipDay] = await Promise.all([
    countAuthEvents({
      organizationId: resolved.organizationId,
      tokenHash: resolved.tokenHash,
      kind: "forgot_password",
      sinceIso: day,
    }),
    ipHash
      ? countAuthEvents({
          organizationId: resolved.organizationId,
          tokenHash: resolved.tokenHash,
          kind: "forgot_password",
          ipHash,
          sinceIso: day,
        })
      : Promise.resolve(0),
  ]);
  if (linkDay >= FORGOT_PER_LINK_PER_DAY) return "rate_limited";
  if (ipDay >= FORGOT_PER_IP_PER_DAY) return "rate_limited";
  return "ok";
}

export async function recordShareVerifyFailure(resolved: ResolvedShareLink) {
  const ip = await getRequestClientIp();
  await recordAuthEvent({
    organizationId: resolved.organizationId,
    tokenHash: resolved.tokenHash,
    kind: "verify_fail",
    ipHash: ip ? hashIp(ip) : null,
  });
}

export async function recordShareForgotPassword(resolved: ResolvedShareLink) {
  const ip = await getRequestClientIp();
  await recordAuthEvent({
    organizationId: resolved.organizationId,
    tokenHash: resolved.tokenHash,
    kind: "forgot_password",
    ipHash: ip ? hashIp(ip) : null,
  });
}

export function toResolvedShareLink(
  resolved: {
    organizationId: string;
    projectId: string;
    linkId: string;
    expiresAt: string;
  },
  token: string,
): ResolvedShareLink {
  return {
    ...resolved,
    tokenHash: hashShareToken(token),
  };
}

export async function getShareAccessState(
  resolved: ResolvedShareLink,
): Promise<ShareAccessState> {
  const hasPassword = await shareLinkPasswordExists(resolved.tokenHash);
  if (!hasPassword) return "needs_password_setup";

  const store = await cookies();
  const cookie = store.get(SHARE_SESSION_COOKIE)?.value;
  if (cookie && parseSessionCookie(cookie, resolved.tokenHash, resolved.linkId)) {
    return "authenticated";
  }
  return "needs_password_login";
}

export async function assertShareAuthenticated(token: string): Promise<ResolvedShareLink> {
  const { resolveShareToken } = await import("@/lib/ircc/project-forms");
  const resolved = await resolveShareToken(token);
  if (!resolved) throw new Error("expired");

  const full = toResolvedShareLink(resolved, token);
  const access = await getShareAccessState(full);
  if (access !== "authenticated") throw new Error("auth_required");
  return full;
}

export async function setShareSessionCookie(resolved: ResolvedShareLink) {
  const linkExpiryMs = new Date(resolved.expiresAt).getTime();
  const exp = Math.min(linkExpiryMs, Date.now() + 30 * 24 * 60 * 60 * 1000);
  const value = signSessionBody(resolved.linkId, resolved.tokenHash, exp);
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  const store = await cookies();
  store.set(SHARE_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearShareSessionCookie() {
  const store = await cookies();
  store.delete(SHARE_SESSION_COOKIE);
}
