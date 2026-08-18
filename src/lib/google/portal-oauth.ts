import { randomBytes } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

const PORTAL_GOOGLE_SCOPES = ["openid", "email"].join(" ");

export const PORTAL_GOOGLE_AAD = {
  oauthState: "portal_google.oauth_state",
  pending: "portal_google.pending",
} as const;

export function portalGoogleClientConfig() {
  const clientId =
    process.env.GOOGLE_PORTAL_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret =
    process.env.GOOGLE_PORTAL_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function portalGoogleConfigured() {
  return portalGoogleClientConfig() !== null;
}

export function portalGoogleOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/portal-google/callback`;
}

export type PortalGoogleOAuthState = {
  locale: string;
  nonce: string;
  origin: string;
  email?: string;
  personId?: string;
  organizationId?: string;
  token?: string;
};

export function encodePortalGoogleOAuthState(
  input: Omit<PortalGoogleOAuthState, "nonce">,
) {
  const payload: PortalGoogleOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
  };
  return {
    state: encryptField(JSON.stringify(payload), PORTAL_GOOGLE_AAD.oauthState),
    nonce: payload.nonce,
  };
}

export function decodePortalGoogleOAuthState(
  state: string,
): PortalGoogleOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, PORTAL_GOOGLE_AAD.oauthState),
    ) as PortalGoogleOAuthState;
    if (!parsed.locale || !parsed.nonce || !parsed.origin) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function portalGoogleAuthUrl(input: { origin: string; state: string }) {
  const config = portalGoogleClientConfig();
  if (!config) throw new Error("portal_google_not_configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: portalGoogleOAuthRedirectUri(input.origin),
    response_type: "code",
    scope: PORTAL_GOOGLE_SCOPES,
    prompt: "select_account",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangePortalGoogleCode(input: {
  origin: string;
  code: string;
}): Promise<{ access_token: string }> {
  const config = portalGoogleClientConfig();
  if (!config) throw new Error("portal_google_not_configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: portalGoogleOAuthRedirectUri(input.origin),
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `portal_google_token_exchange:${response.status}:${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as { access_token: string };
}

export type PortalGoogleIdentity = {
  email: string;
  googleSub: string;
};

export async function portalGoogleIdentity(
  accessToken: string,
): Promise<PortalGoogleIdentity | null> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as {
    id?: string;
    email?: string;
    verified_email?: boolean;
  };
  const email = data.email?.trim().toLowerCase();
  const googleSub = data.id?.trim();
  if (!email || !googleSub || data.verified_email !== true) return null;
  return { email, googleSub };
}
