"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppBaseUrl } from "@/lib/app-url";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getValidSquareAccessToken,
  listSquareLocations,
  type SquareConnectionRow,
} from "@/lib/square/client";
import {
  encodeSquareOAuthState,
  revokeSquareToken,
  squareAuthUrl,
  squareConfigured,
  SQUARE_AAD,
} from "@/lib/square/oauth";
import { getSquareSecrets } from "@/lib/square/secrets";

export type SquareActionState = {
  error?: string;
  message?: string;
};

async function requireAdmin() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  if (!canAdministerOrg(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership, user };
}

export async function startSquareConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(
      `/${locale}/settings/payments?square=${encodeURIComponent(reason)}`,
    );
  };
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!squareConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeSquareOAuthState({
    organizationId: gate.membership.organization.id,
    userId: gate.user.id,
    locale,
    origin,
  });
  redirect(squareAuthUrl({ origin, state }));
}

export async function disconnectSquareAction(
  locale: string,
): Promise<SquareActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();

  const { data: connection } = await admin
    .from("square_connections")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (connection) {
    const secrets = await getSquareSecrets(connection.id as string);
    if (secrets) {
      try {
        const access = decryptField(
          secrets.access_token_encrypted,
          SQUARE_AAD.accessToken,
        );
        await revokeSquareToken(access);
      } catch {
        /* best-effort revoke */
      }
    }
    const { error } = await admin
      .from("square_connections")
      .delete()
      .eq("id", connection.id);
    if (error) {
      console.error("disconnect square:", error.message);
      return { error: "save_failed" };
    }
  }

  revalidatePath(`/${locale}/settings/payments`);
  return { message: "disconnected" };
}

export async function saveSquareCancelPolicyAction(
  formData: FormData,
): Promise<SquareActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const enabledRaw = String(formData.get("cancelRefundEnabled") || "");
  const cancelRefundEnabled =
    enabledRaw === "on" || enabledRaw === "true" || enabledRaw === "1";

  const feeEnabledRaw = String(formData.get("cancelRefundFeeEnabled") || "");
  const feeTierEnabled =
    cancelRefundEnabled &&
    (feeEnabledRaw === "on" || feeEnabledRaw === "true" || feeEnabledRaw === "1");

  const feeUnitRaw = String(formData.get("cancelRefundFeeType") || "fixed");
  const feeUnit = feeUnitRaw === "percent" ? "percent" : "fixed";
  const feeAmount = Number.parseFloat(
    String(formData.get("cancelRefundFeeAmount") || "0"),
  );
  const parsedAmount = Number.isFinite(feeAmount) ? Math.max(0, feeAmount) : 0;
  const hasFee = feeTierEnabled && parsedAmount > 0;
  const feeType = hasFee ? feeUnit : "none";
  const feeCents =
    feeType === "fixed" ? Math.round(parsedAmount * 100) : 0;
  const feePercent =
    feeType === "percent"
      ? Math.max(0, Math.min(100, Math.trunc(parsedAmount)))
      : 0;
  const freeDays = Math.max(
    0,
    Math.min(
      365,
      Math.trunc(Number(formData.get("cancelFreeDaysBefore") || 0)),
    ),
  );
  const feeDays = Math.max(
    0,
    Math.min(
      365,
      Math.trunc(Number(formData.get("cancelFeeDaysBefore") || 0)),
    ),
  );

  if (feeTierEnabled && freeDays <= feeDays) {
    return { error: "invalid_policy" };
  }

  const locale = String(formData.get("locale") || "en");
  const admin = createServiceClient();
  const { data: existing, error: loadError } = await admin
    .from("square_connections")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (loadError) {
    console.error("saveSquareCancelPolicy load:", loadError.message);
    return { error: "save_failed" };
  }
  if (!existing) return { error: "not_connected" };

  const { error } = await admin
    .from("square_connections")
    .update(
      cancelRefundEnabled
        ? {
            cancel_refund_enabled: true,
            cancel_free_days_before: freeDays,
            cancel_min_days_before: hasFee ? feeDays : 0,
            cancel_refund_fee_type: feeType,
            cancel_refund_fee_cents: feeType === "fixed" ? feeCents : 0,
            cancel_refund_fee_percent: feeType === "percent" ? feePercent : 0,
            updated_at: new Date().toISOString(),
          }
        : {
            cancel_refund_enabled: false,
            updated_at: new Date().toISOString(),
          },
    )
    .eq("id", existing.id);
  if (error) {
    console.error("saveSquareCancelPolicy:", error.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${locale}/settings/payments`);
  return { message: "saved" };
}

export async function getSquareConnectionPublic(organizationId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("square_connections")
    .select(
      "id, business_name, merchant_id, currency, is_enabled, created_at, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

/** Used by OAuth callback after token exchange. */
export async function persistSquareConnection(input: {
  organizationId: string;
  userId: string;
  merchantId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}) {
  const locations = await listSquareLocations(input.accessToken);
  const location = locations[0];
  if (!location?.id) {
    throw new Error("square_no_location");
  }

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("square_connections")
    .select("id")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  let connectionId = existing?.id as string | undefined;
  const row = {
    organization_id: input.organizationId,
    connected_by: input.userId,
    merchant_id: input.merchantId,
    location_id: location.id,
    currency: location.currency ?? "CAD",
    business_name: location.business_name ?? location.name ?? null,
    is_enabled: true,
    updated_at: new Date().toISOString(),
  };

  if (connectionId) {
    const { error } = await admin
      .from("square_connections")
      .update(row)
      .eq("id", connectionId);
    if (error) throw new Error(error.message);
  } else {
    const inserted = await admin
      .from("square_connections")
      .insert(row)
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "insert_failed");
    }
    connectionId = inserted.data.id as string;
  }

  const { upsertSquareSecrets } = await import("@/lib/square/secrets");
  await upsertSquareSecrets({
    connectionId,
    accessTokenEncrypted: encryptField(
      input.accessToken,
      SQUARE_AAD.accessToken,
    ),
    refreshTokenEncrypted: encryptField(
      input.refreshToken,
      SQUARE_AAD.refreshToken,
    ),
    accessTokenExpiresAt: input.expiresAt,
  });

  return connectionId;
}

export async function ensureSquareAccessToken(
  connection: SquareConnectionRow,
) {
  return getValidSquareAccessToken(connection);
}
