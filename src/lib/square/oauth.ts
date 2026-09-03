import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";

export const SQUARE_OAUTH_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
  "ORDERS_READ",
  "ORDERS_WRITE",
].join("+");

export const SQUARE_AAD = {
  accessToken: "square_secrets.access_token",
  refreshToken: "square_secrets.refresh_token",
  oauthState: "square.oauth_state",
} as const;

export type SquareEnvironment = "sandbox" | "production";

export function squareEnvironment(): SquareEnvironment {
  const raw = process.env.SQUARE_ENVIRONMENT?.trim().toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

export function squareClientConfig() {
  const applicationId = process.env.SQUARE_APPLICATION_ID?.trim();
  const applicationSecret = process.env.SQUARE_APPLICATION_SECRET?.trim();
  if (!applicationId || !applicationSecret) return null;
  return {
    applicationId,
    applicationSecret,
    environment: squareEnvironment(),
  };
}

export function squareConfigured() {
  return squareClientConfig() !== null;
}

export function squareConnectBaseUrl(environment = squareEnvironment()) {
  return environment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function squareOAuthRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/square/callback`;
}

export function squareWebhookNotificationUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/square/webhook`;
}

/** Square HMAC is over the exact registered notification URL. Try APP_URL, the request host, and www/apex. */
export function squareWebhookNotificationUrlCandidates(
  primaryOrigin: string,
  requestUrl: string,
): string[] {
  const origins = new Set<string>();
  const addOrigin = (raw: string) => {
    try {
      const url = new URL(raw);
      origins.add(url.origin);
      const host = url.hostname;
      if (host.startsWith("www.")) {
        origins.add(`${url.protocol}//${host.slice(4)}`);
      } else if (host !== "localhost" && host !== "127.0.0.1") {
        origins.add(`${url.protocol}//www.${host}`);
      }
    } catch {
      // ignore invalid origins
    }
  };
  addOrigin(primaryOrigin);
  addOrigin(requestUrl);
  return [...origins].map((origin) => squareWebhookNotificationUrl(origin));
}

export function squareAuthUrl(input: { origin: string; state: string }) {
  const config = squareClientConfig();
  if (!config) throw new Error("square_not_configured");
  const params = new URLSearchParams({
    client_id: config.applicationId,
    scope: SQUARE_OAUTH_SCOPES.replaceAll("+", " "),
    session: "false",
    state: input.state,
    redirect_uri: squareOAuthRedirectUri(input.origin),
  });
  return `${squareConnectBaseUrl(config.environment)}/oauth2/authorize?${params.toString()}`;
}

export type SquareTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at?: string;
  merchant_id?: string;
  token_type?: string;
};

export async function exchangeSquareCode(input: {
  origin: string;
  code: string;
}): Promise<SquareTokenResponse> {
  const config = squareClientConfig();
  if (!config) throw new Error("square_not_configured");
  const response = await fetch(
    `${squareConnectBaseUrl(config.environment)}/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
      },
      body: JSON.stringify({
        client_id: config.applicationId,
        client_secret: config.applicationSecret,
        code: input.code,
        grant_type: "authorization_code",
        redirect_uri: squareOAuthRedirectUri(input.origin),
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `square_token_exchange:${response.status}:${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as SquareTokenResponse;
}

export async function refreshSquareAccessToken(
  refreshToken: string,
): Promise<SquareTokenResponse> {
  const config = squareClientConfig();
  if (!config) throw new Error("square_not_configured");
  const response = await fetch(
    `${squareConnectBaseUrl(config.environment)}/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
      },
      body: JSON.stringify({
        client_id: config.applicationId,
        client_secret: config.applicationSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `square_token_refresh:${response.status}:${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as SquareTokenResponse;
}

export async function revokeSquareToken(accessToken: string) {
  const config = squareClientConfig();
  if (!config) return;
  await fetch(`${squareConnectBaseUrl(config.environment)}/oauth2/revoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": "2025-01-23",
      Authorization: `Client ${config.applicationSecret}`,
    },
    body: JSON.stringify({
      client_id: config.applicationId,
      access_token: accessToken,
    }),
  }).catch(() => undefined);
}

export type SquareOAuthState = {
  organizationId: string;
  userId: string;
  locale: string;
  nonce: string;
  origin: string;
};

export function encodeSquareOAuthState(
  input: Omit<SquareOAuthState, "nonce">,
) {
  const payload: SquareOAuthState = {
    ...input,
    nonce: randomBytes(12).toString("base64url"),
  };
  return encryptField(JSON.stringify(payload), SQUARE_AAD.oauthState);
}

export function decodeSquareOAuthState(state: string): SquareOAuthState | null {
  try {
    const parsed = JSON.parse(
      decryptField(state, SQUARE_AAD.oauthState),
    ) as SquareOAuthState;
    if (!parsed.organizationId || !parsed.userId || !parsed.locale) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Square webhook signature: HMAC-SHA256(notification_url + body, signature_key). */
export function verifySquareWebhookSignature(input: {
  signatureHeader: string | null;
  body: string;
  notificationUrl: string;
}): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  if (!key || !input.signatureHeader) return false;
  const hmac = createHmac("sha256", key)
    .update(input.notificationUrl + input.body)
    .digest("base64");
  const expected = Buffer.from(hmac);
  const received = Buffer.from(input.signatureHeader);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function verifySquareWebhookRequest(input: {
  signatureHeader: string | null;
  body: string;
  notificationUrls: string[];
}): boolean {
  return input.notificationUrls.some((notificationUrl) =>
    verifySquareWebhookSignature({
      signatureHeader: input.signatureHeader,
      body: input.body,
      notificationUrl,
    }),
  );
}
