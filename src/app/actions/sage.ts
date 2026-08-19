"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getOrgSageConnection,
  listSageBusinesses,
  pickSageBusiness,
  SAGE_CONNECTION_SELECT,
  type SageConnectionRow,
} from "@/lib/sage/client";
import {
  listSageContactTypes,
  pickCustomerContactTypeId,
} from "@/lib/sage/contacts";
import {
  encodeSageOAuthState,
  sageAccessExpiry,
  sageAuthUrl,
  sageConfigured,
  SAGE_AAD,
  type SageTokenResponse,
} from "@/lib/sage/oauth";
import { upsertSageSecrets } from "@/lib/sage/secrets";
import {
  listSageSalesLedgerAccounts,
  listSageTaxRates,
  suggestCaTaxMappings,
} from "@/lib/sage/tax";
import { matchExistingSageContactsForOrg } from "@/lib/sage/sync-people";

export type SageActionState = {
  error?: string;
  message?: string;
  linked?: number;
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

export async function startSageConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(
      `/${locale}/settings/payments?sage=${encodeURIComponent(reason)}`,
    );
  };
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!sageConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeSageOAuthState({
    organizationId: gate.membership.organization.id,
    userId: gate.user.id,
    locale,
    origin,
  });
  redirect(sageAuthUrl({ origin, state }));
}

export async function disconnectSageAction(
  locale: string,
): Promise<SageActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();
  const { error } = await admin
    .from("sage_connections")
    .delete()
    .eq("organization_id", orgId);
  if (error) {
    console.error("disconnect sage:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/settings/payments`);
  return { message: "disconnected" };
}

export async function persistSageConnection(input: {
  organizationId: string;
  userId: string;
  tokens: SageTokenResponse;
}) {
  if (!input.tokens.access_token || !input.tokens.refresh_token) {
    throw new Error("sage_token_invalid");
  }

  const businesses = await listSageBusinesses(input.tokens.access_token);
  const business = pickSageBusiness(businesses);
  if (!business?.id) throw new Error("sage_no_business");

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("sage_connections")
    .select("id")
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const row = {
    organization_id: input.organizationId,
    connected_by: input.userId,
    business_id: business.id,
    business_name: business.displayed_as ?? business.name ?? null,
    country_id: business.country?.id ?? null,
    currency: business.currency?.id ?? "CAD",
    is_enabled: true,
    updated_at: new Date().toISOString(),
  };

  let connectionId = existing?.id as string | undefined;
  if (connectionId) {
    const { error } = await admin
      .from("sage_connections")
      .update(row)
      .eq("id", connectionId);
    if (error) throw new Error(error.message);
  } else {
    const inserted = await admin
      .from("sage_connections")
      .insert(row)
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "insert_failed");
    }
    connectionId = inserted.data.id as string;
  }

  const dek = await getOrgDataKey(input.organizationId);
  await upsertSageSecrets({
    connectionId,
    accessTokenEncrypted: encryptField(
      input.tokens.access_token,
      SAGE_AAD.accessToken,
      dek,
    ),
    refreshTokenEncrypted: encryptField(
      input.tokens.refresh_token,
      SAGE_AAD.refreshToken,
      dek,
    ),
    accessTokenExpiresAt: sageAccessExpiry(input.tokens),
  });

  const { data: connection } = await admin
    .from("sage_connections")
    .select(SAGE_CONNECTION_SELECT)
    .eq("id", connectionId)
    .single();
  if (!connection) throw new Error("sage_connection_missing");
  const conn = connection as SageConnectionRow;

  const [types, ledgers, rates] = await Promise.all([
    listSageContactTypes(conn),
    listSageSalesLedgerAccounts(conn),
    listSageTaxRates(conn),
  ]);

  const customerTypeId = pickCustomerContactTypeId(types);
  const defaultLedger = ledgers[0];
  await admin
    .from("sage_connections")
    .update({
      customer_contact_type_id: customerTypeId,
      default_ledger_account_id:
        conn.default_ledger_account_id || defaultLedger?.id || null,
      default_ledger_account_name:
        conn.default_ledger_account_name ||
        defaultLedger?.displayed_as ||
        defaultLedger?.nominal_code ||
        null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  const { count } = await admin
    .from("sage_tax_mappings")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", input.organizationId);
  if (!count) {
    const suggestions = suggestCaTaxMappings(rates);
    if (suggestions.length > 0) {
      await admin.from("sage_tax_mappings").insert(
        suggestions.map((row) => ({
          organization_id: input.organizationId,
          ...row,
        })),
      );
    }
  }

  await matchExistingSageContactsForOrg(input.organizationId);
  return connectionId;
}

const mappingSchema = z.object({
  locale: z.enum(["en", "fr", "es"]),
  ledgerAccountId: z.string().trim().min(1),
  mappings: z.array(
    z.object({
      countryCode: z.string().length(2),
      regionCode: z.string().trim().max(8).optional().or(z.literal("")),
      taxRateId: z.string().trim().min(1),
    }),
  ),
});

export async function saveSageSettingsAction(
  _prev: SageActionState,
  formData: FormData,
): Promise<SageActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const locale = String(formData.get("locale") || "en") as "en" | "fr" | "es";

  const mappingKeys = formData.getAll("mappingKey").map(String);
  const mappings = mappingKeys.map((key) => {
    const [countryCode, regionCode] = key.split(":");
    return {
      countryCode: countryCode || "CA",
      regionCode: regionCode || "",
      taxRateId: String(formData.get(`taxRate:${key}`) || ""),
    };
  });

  const parsed = mappingSchema.safeParse({
    locale,
    ledgerAccountId: String(formData.get("ledgerAccountId") || ""),
    mappings,
  });
  if (!parsed.success) return { error: "invalid" };

  const connection = await getOrgSageConnection(orgId);
  if (!connection) return { error: "not_connected" };

  const rates = await listSageTaxRates(connection);
  const ledgers = await listSageSalesLedgerAccounts(connection);
  const ledger = ledgers.find(
    (row) => row.id === parsed.data.ledgerAccountId,
  );
  if (!ledger?.id) return { error: "invalid_ledger" };

  const admin = createServiceClient();
  const { error: connError } = await admin
    .from("sage_connections")
    .update({
      default_ledger_account_id: ledger.id,
      default_ledger_account_name:
        ledger.displayed_as ?? ledger.nominal_code ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
  if (connError) {
    console.error("saveSageSettings connection:", connError.message);
    return { error: "save_failed" };
  }

  const rows = parsed.data.mappings
    .map((mapping) => {
      const rate = rates.find((row) => row.id === mapping.taxRateId);
      if (!rate?.id) return null;
      return {
        organization_id: orgId,
        country_code: mapping.countryCode.toUpperCase(),
        region_code: mapping.regionCode || null,
        sage_tax_rate_id: rate.id,
        sage_tax_rate_name: rate.displayed_as ?? rate.name ?? null,
        percentage: Number(
          typeof rate.percentage === "number"
            ? rate.percentage
            : Number.parseFloat(String(rate.percentage ?? "0")),
        ),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const { error: deleteError } = await admin
    .from("sage_tax_mappings")
    .delete()
    .eq("organization_id", orgId);
  if (deleteError) {
    console.error("saveSageSettings delete mappings:", deleteError.message);
    return { error: "save_failed" };
  }
  if (rows.length > 0) {
    const { error: insertError } = await admin
      .from("sage_tax_mappings")
      .insert(rows);
    if (insertError) {
      console.error("saveSageSettings insert mappings:", insertError.message);
      return { error: "save_failed" };
    }
  }

  revalidatePath(`/${parsed.data.locale}/settings/payments`);
  return { message: "saved" };
}

export async function syncSageClientsAction(
  locale: string,
): Promise<SageActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  try {
    const result = await matchExistingSageContactsForOrg(
      gate.membership.organization.id,
    );
    revalidatePath(`/${locale}/settings/payments`);
    revalidatePath(`/${locale}/people`);
    return { message: "synced", linked: result.linked };
  } catch (error) {
    console.error("syncSageClientsAction:", error);
    return { error: "sync_failed" };
  }
}
