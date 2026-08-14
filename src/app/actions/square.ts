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
      `/${locale}/settings/organization?square=${encodeURIComponent(reason)}`,
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
    .select(
      "id, organization_id, connected_by, merchant_id, location_id, currency, business_name, is_enabled",
    )
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

  revalidatePath(`/${locale}/settings/organization`);
  return { message: "disconnected" };
}

export async function getSquareConnectionPublic(organizationId: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("square_connections")
    .select("id, business_name, merchant_id, currency, is_enabled, created_at")
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
