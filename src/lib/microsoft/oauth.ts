import { randomBytes } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

export const MICROSOFT_CALENDAR_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
].join(" ");

export const MICROSOFT_CALENDAR_AAD = {
  refreshToken: "microsoft_calendar_secrets.refresh_token",
  accessToken: "microsoft_calendar_secrets.access_token",
  channelToken: "microsoft_calendar_secrets.channel_token",
  oauthState: "microsoft_calendar.oauth_state",
} as const;

const AUTHORIZE_PATH = "/oauth2/v2.0/authorize";
const TOKEN_PATH = "/oauth2/v2.0/token";

export function microsoftCalendarTenant() {
  const tenant = process.env.MICROSOFT_CALENDAR_TENANT?.trim();
  return tenant || "common";
}

export function microsoftCalendarClientConfig() {
  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenant: microsoftCalendarTenant() };
}

export function microsoftCalendarConfigured() {
  return microsoftCalendarClientConfig() !== null;
}

function microsoftLoginBase(tenant: string) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}`;
}

export function microsoftOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/microsoft-calendar/callback`;
}

export function microsoftAuthUrl(input: {
  origin: string;
  state: string;
}) {
  const config = microsoftCalendarClientConfig();
  if (!config) {
    throw new Error("microsoft_calendar_not_configured");
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: microsoftOAuthRedirectUri(input.origin),
    response_mode: "query",
    scope: MICROSOFT_CALENDAR_SCOPES,
    prompt: "select_account",
    state: input.state,
  });
  return `${microsoftLoginBase(config.tenant)}${AUTHORIZE_PATH}?${params.toString()}`;
}

export type MicrosoftTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope?: string;
  id_token?: string;
};

async function postToken(
  config: { clientId: string; clientSecret: string; tenant: string },
  body: URLSearchParams,
): Promise<MicrosoftTokenResponse> {
  const response = await fetch(
    `${microsoftLoginBase(config.tenant)}${TOKEN_PATH}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `microsoft_token:${response.status}:${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as MicrosoftTokenResponse;
}

export async function exchangeMicrosoftCode(input: {
  origin: string;
  code: string;
}): Promise<MicrosoftTokenResponse> {
  const config = microsoftCalendarClientConfig();
  if (!config) throw new Error("microsoft_calendar_not_configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: microsoftOAuthRedirectUri(input.origin),
    scope: MICROSOFT_CALENDAR_SCOPES,
  });
  return postToken(config, body);
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string,
): Promise<MicrosoftTokenResponse> {
  const config = microsoftCalendarClientConfig();
  if (!config) throw new Error("microsoft_calendar_not_configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MICROSOFT_CALENDAR_SCOPES,
  });
  return postToken(config, body);
}

export async function microsoftUserEmail(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId"',
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    mail?: string | null;
    userPrincipalName?: string | null;
  };
  const email = data.mail?.trim() || data.userPrincipalName?.trim();
  return email || null;
}

export type MicrosoftOAuthState = {
  organizationId: string;
  userId: string;
  locale: string;
  nonce: string;
  origin: string;
  intent: "calendar" | "meetings";
};

export function encodeMicrosoftOAuthState(
  input: Omit<MicrosoftOAuthState, "nonce">,
) {
  const payload: MicrosoftOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
    intent: input.intent === "meetings" ? "meetings" : "calendar",
  };
  return encryptField(
    JSON.stringify(payload),
    MICROSOFT_CALENDAR_AAD.oauthState,
  );
}

export function decodeMicrosoftOAuthState(
  state: string,
): MicrosoftOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, MICROSOFT_CALENDAR_AAD.oauthState),
    ) as MicrosoftOAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.locale) return null;
    return {
      ...parsed,
      intent: parsed.intent === "meetings" ? "meetings" : "calendar",
    };
  } catch {
    return null;
  }
}
