"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import { docxBufferToHtml, plainTextToHtml } from "@/lib/contracts/docx";
import { MAX_CONTRACT_HTML_CHARS, MAX_CONTRACT_UPLOAD_BYTES } from "@/lib/contracts/types";
import { applyContractSignature } from "@/lib/contracts/sign";
import {
  appendContractAudit,
  issueContractsForAppointment,
} from "@/lib/contracts/issue";
import { encryptContractSignatureWrite } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";
import { toAppLocale } from "@/lib/i18n/locales";

export type ContractActionState = {
  error?: string;
  message?: string;
  html?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

function parseServiceIds(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

const saveSchema = z.object({
  locale: localeSchema,
  templateId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1).max(120),
  bodyHtml: z.string().trim().min(1).max(MAX_CONTRACT_HTML_CHARS),
  serviceIds: z.array(z.string().uuid()).min(1).max(50),
  requireConsultantSignature: z.boolean(),
  sendOnBooking: z.boolean(),
  isActive: z.boolean(),
});

export async function parseContractUploadAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 1) return { error: "invalid_upload" };
  if (file.size > MAX_CONTRACT_UPLOAD_BYTES) return { error: "file_too_large" };
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (name.endsWith(".docx")) {
      return { html: await docxBufferToHtml(buffer), message: "imported" };
    }
    if (name.endsWith(".txt") || name.endsWith(".html") || name.endsWith(".htm")) {
      const text = buffer.toString("utf8");
      return {
        html: name.endsWith(".txt")
          ? plainTextToHtml(text)
          : sanitizeContractHtml(text),
        message: "imported",
      };
    }
    return { error: "unsupported_file" };
  } catch (err) {
    console.error("parse contract upload:", err);
    return { error: "invalid_upload" };
  }
}

export async function saveContractTemplateAction(
  _prev: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const parsed = saveSchema.safeParse({
    locale: formData.get("locale") || "en",
    templateId: String(formData.get("templateId") || ""),
    title: String(formData.get("title") || ""),
    bodyHtml: String(formData.get("bodyHtml") || ""),
    serviceIds: parseServiceIds(String(formData.get("serviceIds") || "[]")),
    requireConsultantSignature: formData.get("requireConsultantSignature") === "on",
    sendOnBooking: formData.get("sendOnBooking") !== "off",
    isActive: formData.get("isActive") !== "off",
  });
  if (!parsed.success) return { error: "invalid" };

  const bodyHtml = sanitizeContractHtml(parsed.data.bodyHtml);
  const supabase = await createClient();
  const orgId = auth.membership.organization.id;
  const user = await getSessionUser();
  const now = new Date().toISOString();
  let templateId = parsed.data.templateId || "";

  if (templateId) {
    const { error } = await supabase
      .from("contract_templates")
      .update({
        title: parsed.data.title,
        body_html: bodyHtml,
        require_consultant_signature: parsed.data.requireConsultantSignature,
        send_on_booking: parsed.data.sendOnBooking,
        is_active: parsed.data.isActive,
        updated_at: now,
      })
      .eq("id", templateId)
      .eq("organization_id", orgId);
    if (error) {
      console.error("update contract template:", error.message);
      return { error: "save_failed" };
    }
  } else {
    const { data, error } = await supabase
      .from("contract_templates")
      .insert({
        organization_id: orgId,
        title: parsed.data.title,
        body_html: bodyHtml || defaultContractBodyHtml(),
        require_consultant_signature: parsed.data.requireConsultantSignature,
        send_on_booking: parsed.data.sendOnBooking,
        is_active: parsed.data.isActive,
        created_by: user?.id ?? null,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("create contract template:", error?.message);
      return { error: "save_failed" };
    }
    templateId = data.id;
  }

  await supabase
    .from("contract_template_services")
    .delete()
    .eq("template_id", templateId)
    .eq("organization_id", orgId);

  if (parsed.data.serviceIds.length > 0) {
    const { error } = await supabase.from("contract_template_services").insert(
      parsed.data.serviceIds.map((serviceId) => ({
        template_id: templateId,
        service_id: serviceId,
        organization_id: orgId,
      })),
    );
    if (error) {
      console.error("contract template services:", error.message);
      return { error: "save_failed" };
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: parsed.data.templateId
      ? "contract.template.update"
      : "contract.template.create",
    resourceType: "contract_template",
    resourceId: templateId,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  return { message: parsed.data.templateId ? "saved" : "created" };
}

export async function deleteContractTemplateAction(
  templateId: string,
  locale: string,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { count } = await supabase
    .from("contract_envelopes")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId)
    .eq("organization_id", auth.membership.organization.id);
  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("contract_templates")
      .update({
        is_active: false,
        send_on_booking: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .eq("organization_id", auth.membership.organization.id);
    if (error) return { error: "save_failed" };
    revalidatePath(`/${toAppLocale(locale)}/services`);
    return { message: "archived" };
  }
  const { error } = await supabase
    .from("contract_templates")
    .delete()
    .eq("id", templateId)
    .eq("organization_id", auth.membership.organization.id);
  if (error) {
    console.error("delete contract template:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${toAppLocale(locale)}/services`);
  return { message: "deleted" };
}

export async function sendAppointmentContractsAction(
  appointmentId: string,
  locale: string,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { data } = await supabase
    .from("booking_appointments")
    .select("id")
    .eq("id", appointmentId)
    .eq("organization_id", auth.membership.organization.id)
    .maybeSingle();
  if (!data) return { error: "not_found" };
  const result = await issueContractsForAppointment(appointmentId);
  revalidatePath(`/${toAppLocale(locale)}/bookings`);
  return { message: result.issued > 0 ? "sent" : "none_due" };
}

export async function resendContractSignerAction(
  envelopeId: string,
  locale: string,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { data: envelope } = await supabase
    .from("contract_envelopes")
    .select("id, organization_id, title, locale, status, appointment_id")
    .eq("id", envelopeId)
    .eq("organization_id", auth.membership.organization.id)
    .maybeSingle();
  if (!envelope) return { error: "not_found" };
  if (!["sent", "viewed", "partially_signed"].includes(envelope.status)) {
    return { error: "closed" };
  }
  const { data: signers } = await supabase
    .from("contract_signers")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("sort_order", { ascending: true });
  const next = (signers ?? []).find((row) => row.status !== "signed");
  if (!next) return { error: "closed" };

  const dek = await getOrgDataKey(auth.membership.organization.id);
  const token = createBookingToken();
  const sealed = encryptContractSignatureWrite({ token }, dek);
  const admin = createServiceClient();
  await admin
    .from("contract_signers")
    .update({
      token_hash: hashBookingToken(token),
      token_encrypted: sealed.token_encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  const { decryptContractSignerRow } = await import(
    "@/lib/security/client-pii"
  );
  const signer = decryptContractSignerRow(next, dek);
  const origin = await getAppBaseUrl();
  const signLocale = toAppLocale(envelope.locale || locale);
  const { sendContractSignatureRequestEmail } = await import(
    "@/lib/email/contract-signature"
  );
  await sendContractSignatureRequestEmail({
    locale: signLocale,
    organizationName: auth.membership.organization.name,
    to: signer.email ?? "",
    signerName: signer.full_name ?? "",
    contractTitle: envelope.title,
    signUrl: `${origin.replace(/\/$/, "")}/${signLocale}/sign/${encodeURIComponent(token)}`,
    role: next.role,
  });
  await appendContractAudit({
    organizationId: envelope.organization_id,
    envelopeId,
    signerId: next.id,
    eventType: "resent",
  });
  revalidatePath(`/${toAppLocale(locale)}/bookings`);
  return { message: "resent" };
}

export async function voidContractEnvelopeAction(
  envelopeId: string,
  locale: string,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_envelopes")
    .update({ status: "voided", voided_at: now, updated_at: now })
    .eq("id", envelopeId)
    .eq("organization_id", auth.membership.organization.id)
    .in("status", ["sent", "viewed", "partially_signed"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "save_failed" };
  await appendContractAudit({
    organizationId: auth.membership.organization.id,
    envelopeId,
    eventType: "voided",
    metadata: { reason: "staff" },
  });
  revalidatePath(`/${toAppLocale(locale)}/bookings`);
  return { message: "voided" };
}

export async function staffSignContractAction(
  envelopeId: string,
  typedName: string,
  kind: "typed" | "drawn",
  image: string | null,
  locale: string,
): Promise<ContractActionState> {
  const auth = await requireManager();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { data: signer } = await supabase
    .from("contract_signers")
    .select("id")
    .eq("envelope_id", envelopeId)
    .eq("organization_id", auth.membership.organization.id)
    .eq("role", "consultant")
    .maybeSingle();
  if (!signer) return { error: "not_found" };
  const result = await applyContractSignature({
    envelopeId,
    signerId: signer.id,
    typedName,
    kind,
    image,
    consent: true,
  });
  if (result.error) return { error: result.error };
  revalidatePath(`/${toAppLocale(locale)}/bookings`);
  return { message: result.message };
}
