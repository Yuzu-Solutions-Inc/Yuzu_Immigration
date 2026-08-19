import { randomBytes } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

export const SAGE_AAD = {
  accessToken: "sage_secrets.access_token",
  refreshToken: "sage_secrets.refresh_token",
  oauthState: "sage.oauth_state",
} as const;

const SAGE_AUTH_URL = "https://www.sageone.com/oauth2/auth/central";
const SAGE_TOKEN_URL = "https://oauth.accounting.sage.com/token";
export const SAGE_API_BASE = "https://api.accounting.sage.com/v3.1";

export function sageClientConfig() {
  const clientId = process.env.SAGE_CLIENT_ID?.trim();
  const clientSecret = process.env.SAGE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function sageConfigured() {
  return sageClientConfig() !== null;
}

export function sageOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/sage/callback`;
}

export function sageAuthUrl(input: { origin: string; state: string }) {
  const config = sageClientConfig();
  if (!config) throw new Error("sage_not_configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: sageOAuthRedirectUri(input.origin),
    scope: "full_access",
    state: input.state,
    filter: "apiv3.1",
    country: "ca",
  });
  return `${SAGE_AUTH_URL}?${params.toString()}`;
}

export type SageTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  resource_owner_id?: string;
};

async function sageTokenRequest(
  body: Record<string, string>,
): Promise<SageTokenResponse> {
  const response = await fetch(SAGE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `sage_token:${response.status}:${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as SageTokenResponse;
}

export async function exchangeSageCode(input: {
  origin: string;
  code: string;
}): Promise<SageTokenResponse> {
  const config = sageClientConfig();
  if (!config) throw new Error("sage_not_configured");
  return sageTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: sageOAuthRedirectUri(input.origin),
  });
}

export async function refreshSageAccessToken(
  refreshToken: string,
): Promise<SageTokenResponse> {
  const config = sageClientConfig();
  if (!config) throw new Error("sage_not_configured");
  return sageTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

export type SageOAuthState = {
  organizationId: string;
  userId: string;
  locale: string;
  nonce: string;
  origin: string;
};

export function encodeSageOAuthState(input: Omit<SageOAuthState, "nonce">) {
  const payload: SageOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
  };
  return encryptField(JSON.stringify(payload), SAGE_AAD.oauthState);
}

export function decodeSageOAuthState(state: string): SageOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, SAGE_AAD.oauthState),
    ) as SageOAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.locale) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sageAccessExpiry(tokens: SageTokenResponse) {
  const seconds = Number(tokens.expires_in);
  const ttl = Number.isFinite(seconds) && seconds > 0 ? seconds : 300;
  return new Date(Date.now() + ttl * 1000);
}
