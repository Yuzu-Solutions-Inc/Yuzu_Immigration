import { randomUUID } from "node:crypto";

import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

import {
  refreshSquareAccessToken,
  squareConnectBaseUrl,
  squareEnvironment,
  SQUARE_AAD,
} from "./oauth";
import {
  getSquareSecrets,
  patchSquareSecrets,
  upsertSquareSecrets,
} from "./secrets";

export type SquareConnectionRow = {
  id: string;
  organization_id: string;
  connected_by: string | null;
  merchant_id: string;
  location_id: string;
  currency: string;
  business_name: string | null;
  is_enabled: boolean;
  cancel_refund_enabled: boolean;
  cancel_free_days_before: number;
  cancel_min_days_before: number;
  cancel_refund_fee_type: string;
  cancel_refund_fee_cents: number;
  cancel_refund_fee_percent: number;
};

const SQUARE_CONNECTION_SELECT =
  "id, organization_id, connected_by, merchant_id, location_id, currency, business_name, is_enabled, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent";

const SQUARE_VERSION = "2025-01-23";

export async function getOrgSquareConnection(
  organizationId: string,
): Promise<SquareConnectionRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("square_connections")
    .select(SQUARE_CONNECTION_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getOrgSquareConnection:", error.message);
    return null;
  }
  return (data as SquareConnectionRow | null) ?? null;
}

async function squareFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${squareConnectBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json };
}

export async function getValidSquareAccessToken(
  connection: SquareConnectionRow,
): Promise<string | null> {
  const secrets = await getSquareSecrets(connection.id);
  if (!secrets) return null;

  const expiresAt = secrets.access_token_expires_at
    ? Date.parse(secrets.access_token_expires_at)
    : 0;
  const dek = await getOrgDataKey(connection.organization_id);
  const accessToken = decryptField(
    secrets.access_token_encrypted,
    SQUARE_AAD.accessToken,
    dek,
  );

  if (expiresAt > Date.now() + 60_000) {
    return accessToken;
  }

  const refreshToken = decryptField(
    secrets.refresh_token_encrypted,
    SQUARE_AAD.refreshToken,
    dek,
  );
  try {
    const tokens = await refreshSquareAccessToken(refreshToken);
    const expires = tokens.expires_at ? new Date(tokens.expires_at) : null;
    await patchSquareSecrets(connection.id, {
      accessTokenEncrypted: encryptField(
        tokens.access_token,
        SQUARE_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: expires,
    });
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      await upsertSquareSecrets({
        connectionId: connection.id,
        accessTokenEncrypted: encryptField(
          tokens.access_token,
          SQUARE_AAD.accessToken,
          dek,
        ),
        refreshTokenEncrypted: encryptField(
          tokens.refresh_token,
          SQUARE_AAD.refreshToken,
          dek,
        ),
        accessTokenExpiresAt: expires,
      });
    }
    return tokens.access_token;
  } catch (error) {
    console.error("square refresh failed:", error);
    return null;
  }
}

export async function listSquareLocations(accessToken: string) {
  const result = await squareFetch(accessToken, "/v2/locations");
  if (!result.ok) {
    throw new Error(`square_locations:${result.status}`);
  }
  const data = result.json as {
    locations?: Array<{
      id?: string;
      name?: string;
      status?: string;
      currency?: string;
      business_name?: string;
    }>;
  };
  return (data.locations ?? []).filter(
    (row) => row.id && row.status === "ACTIVE",
  );
}

export type CreateSquarePaymentLinkInput = {
  connection: SquareConnectionRow;
  amountCents: number;
  currency: string;
  name: string;
  paymentNote: string;
  redirectUrl: string;
  buyerEmail?: string | null;
};

export type CreateSquarePaymentLinkResult = {
  paymentLinkId: string;
  orderId: string | null;
  checkoutUrl: string;
};

export async function createSquarePaymentLink(
  input: CreateSquarePaymentLinkInput,
): Promise<CreateSquarePaymentLinkResult> {
  const accessToken = await getValidSquareAccessToken(input.connection);
  if (!accessToken) throw new Error("square_token_unavailable");

  const body = {
    idempotency_key: randomUUID(),
    description: input.name.slice(0, 4096),
    quick_pay: {
      name: input.name.slice(0, 255),
      price_money: {
        amount: input.amountCents,
        currency: input.currency.toUpperCase(),
      },
      location_id: input.connection.location_id,
    },
    checkout_options: {
      redirect_url: input.redirectUrl,
      ask_for_shipping_address: false,
    },
    pre_populated_data: input.buyerEmail
      ? { buyer_email: input.buyerEmail }
      : undefined,
    payment_note: input.paymentNote.slice(0, 500),
  };

  const result = await squareFetch(accessToken, "/v2/online-checkout/payment-links", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    console.error("createSquarePaymentLink:", result.status, result.json);
    throw new Error("square_payment_link_failed");
  }

  const data = result.json as {
    payment_link?: {
      id?: string;
      url?: string;
      order_id?: string;
    };
  };
  const link = data.payment_link;
  if (!link?.id || !link.url) {
    throw new Error("square_payment_link_invalid");
  }

  return {
    paymentLinkId: link.id,
    orderId: link.order_id ?? null,
    checkoutUrl: link.url,
  };
}

export async function findSquarePaymentIdByOrderId(input: {
  connection: SquareConnectionRow;
  orderId: string;
}): Promise<string | null> {
  const accessToken = await getValidSquareAccessToken(input.connection);
  if (!accessToken) throw new Error("square_token_unavailable");

  const result = await squareFetch(
    accessToken,
    `/v2/orders/${encodeURIComponent(input.orderId)}`,
  );
  if (!result.ok) {
    console.error("findSquarePaymentIdByOrderId:", result.status, result.json);
    throw new Error("square_payment_lookup_failed");
  }

  const data = result.json as {
    order?: {
      tenders?: Array<{ id?: string; payment_id?: string }>;
    };
  };
  const tenders = data.order?.tenders ?? [];
  const withPayment = tenders.find((row) => row.payment_id);
  if (withPayment?.payment_id) return withPayment.payment_id;
  // Older/checkout tenders sometimes only expose tender id (= payment id).
  return tenders.find((row) => row.id)?.id ?? null;
}

export type RefundSquarePaymentInput = {
  connection: SquareConnectionRow;
  paymentId: string;
  amountCents: number;
  currency: string;
  reason?: string;
  /** Max 45 chars for Square idempotency. */
  idempotencyKey: string;
};

export type RefundSquarePaymentResult = {
  refundId: string;
  status: string | null;
};

export async function refundSquarePayment(
  input: RefundSquarePaymentInput,
): Promise<RefundSquarePaymentResult> {
  const accessToken = await getValidSquareAccessToken(input.connection);
  if (!accessToken) throw new Error("square_token_unavailable");

  const body = {
    idempotency_key: input.idempotencyKey.slice(0, 45),
    payment_id: input.paymentId,
    amount_money: {
      amount: input.amountCents,
      currency: input.currency.toUpperCase(),
    },
    reason: (input.reason ?? "Booking cancelled").slice(0, 192),
  };

  const result = await squareFetch(accessToken, "/v2/refunds", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    console.error("refundSquarePayment:", result.status, result.json);
    throw new Error("square_refund_failed");
  }

  const data = result.json as {
    refund?: { id?: string; status?: string };
  };
  const refund = data.refund;
  if (!refund?.id) {
    throw new Error("square_refund_invalid");
  }

  return {
    refundId: refund.id,
    status: refund.status ?? null,
  };
}

export function squareIsSandbox() {
  return squareEnvironment() === "sandbox";
}
