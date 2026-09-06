"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import { createFinanceDb } from "@/lib/finance/org-db";
import type { Partner, PartnerListRow } from "@/lib/finance/types";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { decryptOrgPayload, encryptOrgRow } from "@/lib/security/encrypted-fields";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import {
  partnerLegalName,
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

export async function listPartnersAction(): Promise<PartnerListRow[]> {
  const membership = await getPrimaryMembership();
  if (!membership) return [];
  const supabase = await createClient();
  const orgId = membership.organization.id;
  const [{ data, error }, { data: peopleRows }] = await Promise.all([
    supabase
      .from("partners")
      .select("*")
      .eq("organization_id", orgId)
      .order("legal_name"),
    supabase
      .from("people")
      .select("id, partner_id")
      .eq("organization_id", orgId),
  ]);
  if (error) throw new Error(error.message);
  const key = await getOrgDataKey(orgId);
  const personIdByPartner = new Map<string, string>();
  for (const row of peopleRows ?? []) {
    if (row.partner_id) personIdByPartner.set(row.partner_id as string, row.id as string);
  }
  return decryptOrgPayload("partners", (data ?? []) as Partner[], key)
    .map((partner) => ({
      ...partner,
      person_id: personIdByPartner.get(partner.id) ?? null,
    }))
    .sort((a, b) =>
      a.legal_name.localeCompare(b.legal_name, "en", { sensitivity: "base" }),
    );
}

export async function upsertPartnerAction(
  input: z.infer<typeof partnerPayloadSchema>,
): Promise<{ error?: string; id?: string }> {
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

  const key = await getOrgDataKey(membership.organization.id);
  const payload: Record<string, unknown> = {
    ...encryptOrgRow(
      "partners",
      {
        legal_name: parsed.data.legal_name,
        contact_name: emptyToNull(parsed.data.contact_name ?? null),
        email: emptyToNull(parsed.data.email ?? null),
        phone: emptyToNull(parsed.data.phone ?? null),
        address_line1: emptyToNull(parsed.data.address_line1 ?? null),
        city: emptyToNull(parsed.data.city ?? null),
        postal_code: emptyToNull(parsed.data.postal_code ?? null),
        notes: emptyToNull(parsed.data.notes ?? null),
      },
      key,
    ),
    kind: parsed.data.kind,
    province: emptyToNull(parsed.data.province ?? null),
    country: emptyToNull(parsed.data.country ?? null),
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
  return { id: partnerId ?? undefined };
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

export type PartnerFormState = { error?: string };

function formStr(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function savePartnerFormAction(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const locale = formStr(formData, "locale") || "en";
  const id = formStr(formData, "id") || undefined;
  const kind = (formStr(formData, "kind") || "customer") as
    | "customer"
    | "provider"
    | "both";
  const firstName = formStr(formData, "firstName");
  const lastName = formStr(formData, "lastName");
  const legalName =
    firstName && lastName
      ? partnerLegalName(firstName, lastName)
      : formStr(formData, "legal_name");

  const penaltyPercent = Number(formStr(formData, "invoice_penalty_percent"));
  const termsDays = Number(formStr(formData, "payment_terms_days"));

  const result = await upsertPartnerAction({
    id,
    legal_name: legalName,
    kind,
    contact_name:
      formStr(formData, "contact_name") ||
      (firstName && lastName ? legalName : null),
    email: formStr(formData, "email") || null,
    phone: formStr(formData, "phone") || null,
    address_line1: formStr(formData, "address_line1") || null,
    city: formStr(formData, "city") || null,
    province: formStr(formData, "province") || null,
    postal_code: formStr(formData, "postal_code") || null,
    country: formStr(formData, "country") || null,
    language: (formStr(formData, "language") || "fr") as "fr" | "en",
    payment_terms_days: Number.isFinite(termsDays) ? termsDays : 30,
    invoice_penalty_monthly_pct: Number.isFinite(penaltyPercent)
      ? penaltyPercent / 100
      : 0.02,
    immigration_status: (formStr(formData, "immigration_status") ||
      undefined) as (typeof PERSON_IMMIGRATION_STATUSES)[number] | undefined,
    status_expires_at: formStr(formData, "status_expires_at") || null,
    preferred_locale: (formStr(formData, "preferred_locale") || undefined) as
      | "en"
      | "fr"
      | "es"
      | undefined,
  });

  if (result.error || !result.id) {
    return { error: result.error ?? "create_failed" };
  }
  redirect(`/${locale}/partners/${result.id}`);
}

export async function deletePartnerFormAction(
  _prev: PartnerFormState,
  formData: FormData,
): Promise<PartnerFormState> {
  const locale = formStr(formData, "locale") || "en";
  const id = formStr(formData, "id");
  const result = await deletePartnerAction(id);
  if (result.error) return { error: result.error };
  redirect(`/${locale}/partners`);
}
