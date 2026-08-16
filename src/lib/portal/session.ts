import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";

export const PORTAL_SESSION_COOKIE = "mc_portal_session";
export const PORTAL_SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export type PortalAccessState =
  | "needs_password_setup"
  | "needs_password_login"
  | "authenticated";

export type PortalSession = {
  accessId: string;
  personId: string;
  organizationId: string;
  accessCode: string;
  accessToken: string;
};

type CookiePayload = {
  accessId: string;
  personId: string;
  organizationId: string;
  exp: number;
};

function signBody(body: string) {
  const sig = createHmac("sha256", requireAppEncryptionKey())
    .update(`portal-session:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

function encodePayload(payload: CookiePayload) {
  const body = `${payload.accessId}:${payload.personId}:${payload.organizationId}:${payload.exp}`;
  return signBody(body);
}

function parsePayload(value: string): CookiePayload | null {
  try {
    const dot = value.lastIndexOf(".");
    if (dot < 1) return null;
    const body = value.slice(0, dot);
    const expected = signBody(body);
    if (expected !== value) return null;
    const parts = body.split(":");
    if (parts.length !== 4) return null;
    const [accessId, personId, organizationId, expRaw] = parts;
    const exp = Number(expRaw);
    if (
      !accessId ||
      !personId ||
      !organizationId ||
      !Number.isFinite(exp) ||
      exp < Date.now()
    ) {
      return null;
    }
    return { accessId, personId, organizationId, exp };
  } catch {
    return null;
  }
}

export async function setPortalSessionCookie(session: PortalSession) {
  const exp = Date.now() + PORTAL_SESSION_MAX_MS;
  const value = encodePayload({
    accessId: session.accessId,
    personId: session.personId,
    organizationId: session.organizationId,
    exp,
  });
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(PORTAL_SESSION_MAX_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearPortalSessionCookie() {
  const store = await cookies();
  store.delete(PORTAL_SESSION_COOKIE);
}

export async function readPortalSessionCookie(): Promise<CookiePayload | null> {
  const store = await cookies();
  const value = store.get(PORTAL_SESSION_COOKIE)?.value;
  if (!value) return null;
  return parsePayload(value);
}
