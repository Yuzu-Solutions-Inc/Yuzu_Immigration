import { randomBytes } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

export const ZOOM_SCOPES = [
  "meeting:write:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
  "user:read:user",
].join(" ");

export const ZOOM_AAD = {
  refreshToken: "zoom_secrets.refresh_token",
  accessToken: "zoom_secrets.access_token",
  oauthState: "zoom.oauth_state",
} as const;

export function zoomClientConfig() {
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (clientId === "ZOOM_CLIENT_ID" || clientSecret === "ZOOM_CLIENT_SECRET") {
    return null;
  }
  return { clientId, clientSecret };
}

export function zoomConfigured() {
  return zoomClientConfig() !== null;
}

export function zoomOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/zoom/callback`;
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function zoomAuthUrl(input: { origin: string; state: string }) {
  const config = zoomClientConfig();
  if (!config) {
    throw new Error("zoom_not_configured");
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: zoomOAuthRedirectUri(input.origin),
    state: input.state,
    scope: ZOOM_SCOPES,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

export type ZoomTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope?: string;
};

async function postZoomToken(body: URLSearchParams): Promise<ZoomTokenResponse> {
  const config = zoomClientConfig();
  if (!config) throw new Error("zoom_not_configured");
  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(config.clientId, config.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`zoom_token:${response.status}:${text.slice(0, 200)}`);
  }
  return (await response.json()) as ZoomTokenResponse;
}

export async function exchangeZoomCode(input: {
  origin: string;
  code: string;
}): Promise<ZoomTokenResponse> {
  return postZoomToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: zoomOAuthRedirectUri(input.origin),
    }),
  );
}

export async function refreshZoomAccessToken(
  refreshToken: string,
): Promise<ZoomTokenResponse> {
  return postZoomToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function zoomUserProfile(accessToken: string) {
  const response = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    id?: string;
    email?: string | null;
  };
  return {
    zoomUserId: data.id ?? null,
    email: data.email?.trim() || null,
  };
}

export type ZoomOAuthState = {
  organizationId: string;
  userId: string;
  locale: string;
  nonce: string;
  origin: string;
};

export function encodeZoomOAuthState(input: Omit<ZoomOAuthState, "nonce">) {
  const payload: ZoomOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
  };
  return encryptField(JSON.stringify(payload), ZOOM_AAD.oauthState);
}

export function decodeZoomOAuthState(state: string): ZoomOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, ZOOM_AAD.oauthState),
    ) as ZoomOAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.locale) return null;
    return parsed;
  } catch {
    return null;
  }
}
