"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import { createFinanceDb } from "@/lib/finance/org-db";
import type { Partner } from "@/lib/finance/types";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { createClient } from "@/lib/supabase/server";
import {
  shouldSyncImmigrationPerson,
  syncPersonFromPartner,
} from "@/lib/crm/partner-person";

const kindSchema = z.enum(["customer", "provider", "both"]);
const languageSchema = z.enum(["fr", "en"]);
const immigrationStatusSchema = z.enum(PERSON_IMMIGRATION_STATUSES);

const partnerPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  legal_name: z.string().trim().min(1).max(200),
  kind: kindSchema.default("customer"),
  contact_name: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(80).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  language: languageSchema.nullable().optional(),
  payment_terms_days: z.number().int().min(0).max(365).optional(),
  invoice_penalty_monthly_pct: z.number().min(0).max(1).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  immigration_status: immigrationStatusSchema.optional(),
  status_expires_at: z.string().max(20).nullable().optional(),
  preferred_locale: z.enum(["en", "fr", "es"]).optional(),
});

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listPartnersAction(): Promise<Partner[]> {
  const membership = await getPrimaryMembership();
  if (!membership) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .eq("organization_id", membership.organization.id)
    .order("legal_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Partner[];
}

export async function upsertPartnerAction(
  input: z.infer<typeof partnerPayloadSchema>,
): Promise<{ error?: string }> {
  const parsed = partnerPayloadSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) return { error: "auth" };
  if (!membership.organization.writable) return { error: "trial_expired" };

  const financeOn = isModuleEnabled(membership.enabledModules, "finance");
  const immigrationOn = isModuleEnabled(membership.enabledModules, "immigration");
  const supabase = await createClient();
  const db = createFinanceDb(supabase, membership.organization.id);

  const payload: Record<string, unknown> = {
    legal_name: parsed.data.legal_name,
    kind: parsed.data.kind,
    contact_name: emptyToNull(parsed.data.contact_name ?? null),
    email: emptyToNull(parsed.data.email ?? null),
    phone: emptyToNull(parsed.data.phone ?? null),
    address_line1: emptyToNull(parsed.data.address_line1 ?? null),
    city: emptyToNull(parsed.data.city ?? null),
    province: emptyToNull(parsed.data.province ?? null),
    postal_code: emptyToNull(parsed.data.postal_code ?? null),
    country: emptyToNull(parsed.data.country ?? null),
    notes: emptyToNull(parsed.data.notes ?? null),
  };

  if (financeOn && (parsed.data.kind === "customer" || parsed.data.kind === "both")) {
    payload.language = parsed.data.language ?? "fr";
    payload.payment_terms_days = parsed.data.payment_terms_days ?? 30;
    payload.invoice_penalty_monthly_pct = parsed.data.invoice_penalty_monthly_pct ?? 0.02;
  }

  if (immigrationOn) {
    payload.immigration_status = parsed.data.immigration_status ?? "none";
    payload.status_expires_at = emptyToNull(parsed.data.status_expires_at ?? null);
    payload.preferred_locale =
      parsed.data.preferred_locale ?? membership.organization.defaultLocale;
  }

  let partnerId = parsed.data.id ?? null;

  if (parsed.data.id) {
    const { error } = await db.from("partners").update(payload).eq("id", parsed.data.id);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await db
      .from("partners")
      .insert({
        ...payload,
        user_id: user.id,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "create_failed" };
    partnerId = created.id as string;
  }

  if (
    immigrationOn &&
    partnerId &&
    shouldSyncImmigrationPerson(parsed.data.kind)
  ) {
    await syncPersonFromPartner(
      {
        supabase,
        orgId: membership.organization.id,
        userId: user.id,
      },
      partnerId,
    );
  }

  revalidatePath("/partners");
  if (partnerId) revalidatePath(`/partners/${partnerId}`);
  return {};
}

export async function deletePartnerAction(id: string): Promise<{ error?: string }> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { error: "invalid" };
  const membership = await getPrimaryMembership();
  if (!membership) return { error: "auth" };
  if (!membership.organization.writable) return { error: "trial_expired" };
  const supabase = await createClient();
  const orgId = membership.organization.id;

  const [{ count: peopleCount }, { count: invoiceCount }, { count: projectCount }] =
    await Promise.all([
      supabase
        .from("people")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("partner_id", parsed.data),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("partner_id", parsed.data),
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("partner_id", parsed.data),
    ]);

  if ((peopleCount ?? 0) > 0 || (invoiceCount ?? 0) > 0 || (projectCount ?? 0) > 0) {
    return { error: "linked_records" };
  }

  const { error } = await supabase
    .from("partners")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/partners");
  return {};
}
