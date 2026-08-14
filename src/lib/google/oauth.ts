import { randomBytes } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
].join(" ");

export const GOOGLE_CALENDAR_AAD = {
  refreshToken: "google_calendar_secrets.refresh_token",
  accessToken: "google_calendar_secrets.access_token",
  channelToken: "google_calendar_secrets.channel_token",
  oauthState: "google_calendar.oauth_state",
} as const;

export function googleCalendarClientConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleCalendarConfigured() {
  return googleCalendarClientConfig() !== null;
}

export function googleOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/google-calendar/callback`;
}

export function googleAuthUrl(input: {
  origin: string;
  state: string;
}) {
  const config = googleCalendarClientConfig();
  if (!config) {
    throw new Error("google_calendar_not_configured");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: googleOAuthRedirectUri(input.origin),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope?: string;
  id_token?: string;
};

export async function exchangeGoogleCode(input: {
  origin: string;
  code: string;
}): Promise<GoogleTokenResponse> {
  const config = googleCalendarClientConfig();
  if (!config) throw new Error("google_calendar_not_configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: googleOAuthRedirectUri(input.origin),
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_token_exchange:${response.status}:${text.slice(0, 200)}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const config = googleCalendarClientConfig();
  if (!config) throw new Error("google_calendar_not_configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_token_refresh:${response.status}:${text.slice(0, 200)}`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function googleUserEmail(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}

export type GoogleOAuthState = {
  organizationId: string;
  userId: string;
  locale: string;
  nonce: string;
  origin: string;
};

export function encodeGoogleOAuthState(
  input: Omit<GoogleOAuthState, "nonce">,
) {
  const payload: GoogleOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
  };
  return encryptField(JSON.stringify(payload), GOOGLE_CALENDAR_AAD.oauthState);
}

export function decodeGoogleOAuthState(state: string): GoogleOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, GOOGLE_CALENDAR_AAD.oauthState),
    ) as GoogleOAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.locale) return null;
    return parsed;
  } catch {
    return null;
  }
}
