"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { createServiceClient } from "@/lib/supabase/admin";
import { getOrgSquareConnection } from "@/lib/square/client";
import {
  createCheckoutPaymentRequest,
  decryptPaymentToken,
} from "@/lib/square/payments";

export type ProjectPaymentActionState = {
  error?: string;
  message?: string;
  checkoutUrl?: string;
  payUrl?: string;
};

const createSchema = z.object({
  locale: z.enum(["en", "fr", "es"]),
  projectId: z.string().uuid(),
  amount: z.string().trim(),
  description: z.string().trim().min(1).max(200),
  personId: z.string().uuid().optional().or(z.literal("")),
});

function parseAmountToCents(raw: string): number | null {
  const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

async function requireMember() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  return { ok: true as const, membership, user };
}

async function requireCreator() {
  const gate = await requireMember();
  if (!gate.ok) return gate;
  if (!canCreateRecords(gate.membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return gate;
}

export async function createProjectPaymentAction(
  _prev: ProjectPaymentActionState,
  formData: FormData,
): Promise<ProjectPaymentActionState> {
  const parsed = createSchema.safeParse({
    locale: toAppLocale(String(formData.get("locale") || "en")),
    projectId: String(formData.get("projectId") || ""),
    amount: String(formData.get("amount") || ""),
    description: String(formData.get("description") || ""),
    personId: String(formData.get("personId") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireCreator();
  if (!gate.ok) return { error: gate.error };

  const amountCents = parseAmountToCents(parsed.data.amount);
  if (!amountCents) return { error: "invalid_amount" };

  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();
  const { data: project } = await admin
    .from("immigration_projects")
    .select("id, title, organization_id")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!project) return { error: "not_found" };

  const connection = await getOrgSquareConnection(orgId);
  if (!connection) return { error: "square_not_connected" };

  const personId = parsed.data.personId || null;
  let buyerEmail: string | null = null;
  if (personId) {
    const { data: person } = await admin
      .from("people")
      .select("email")
      .eq("id", personId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (person?.email) {
      const { decryptPersonRow } = await import("@/lib/security/client-pii");
      const { getOrgDataKey } = await import("@/lib/security/org-data-key");
      const dek = await getOrgDataKey(orgId);
      const decrypted = decryptPersonRow(
        { email: person.email as string },
        dek,
      );
      buyerEmail = decrypted.email ?? null;
    }
  }

  try {
    const checkout = await createCheckoutPaymentRequest({
      organizationId: orgId,
      source: "project",
      amountCents,
      currency: connection.currency || "CAD",
      description: parsed.data.description,
      locale: parsed.data.locale,
      projectId: project.id as string,
      personId,
      createdBy: gate.user.id,
      buyerEmail,
      expiresInHours: 168,
    });

    const origin = await getAppBaseUrl();
    const payUrl = `${origin.replace(/\/$/, "")}/${parsed.data.locale}/pay/${checkout.token}`;

    revalidatePath(`/${parsed.data.locale}/projects/${parsed.data.projectId}`);
    return {
      message: "created",
      checkoutUrl: checkout.checkoutUrl,
      payUrl,
    };
  } catch (error) {
    console.error("createProjectPayment:", error);
    return { error: "create_failed" };
  }
}

export async function listProjectPaymentLinks(projectId: string) {
  const gate = await requireMember();
  if (!gate.ok) return [];
  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select(
      "id, status, amount_cents, currency, description, checkout_url, paid_at, created_at, token_encrypted",
    )
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .eq("source", "project")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    console.error("listProjectPaymentLinks:", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const token = decryptPaymentToken(row.token_encrypted as string | null);
    return {
      id: row.id as string,
      status: row.status as string,
      amountCents: row.amount_cents as number,
      currency: row.currency as string,
      description: row.description as string,
      checkoutUrl: row.checkout_url as string | null,
      paidAt: row.paid_at as string | null,
      createdAt: row.created_at as string,
      token,
    };
  });
}
