import { createHash } from "node:crypto";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import {
  CONTRACT_CONSENT_VERSION,
  CONTRACT_ENVELOPES_BUCKET,
  CONTRACT_EXPIRES_DAYS,
  isPngSignatureDataUrl,
} from "@/lib/contracts/types";
import { fillContractHtml } from "@/lib/contracts/html";
import { buildContractPdf } from "@/lib/contracts/pdf";
import { pickContractBody } from "@/lib/contracts/translations";
import { contractMergeVariables } from "@/lib/contracts/variables";
import { encryptDocument } from "@/lib/documents/crypto";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  decryptBookingFormAnswers,
  decryptBookingGuestRow,
  decryptContractFilledHtml,
  decryptContractSignatureFields,
  decryptContractSignerRow,
  decryptStaffContractSignature,
  encryptContractFilledHtml,
  encryptContractSignerWrite,
  encryptContractSignatureWrite,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export function sha256Hex(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function namesMatch(typed: string, expected: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLowerCase();
  const a = normalize(typed);
  const b = normalize(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  return (
    aParts[0] === bParts[0] &&
    aParts[aParts.length - 1] === bParts[bParts.length - 1]
  );
}

export async function appendContractAudit(input: {
  organizationId: string;
  envelopeId: string;
  signerId?: string | null;
  eventType: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("contract_audit_events").insert({
    organization_id: input.organizationId,
    envelope_id: input.envelopeId,
    signer_id: input.signerId ?? null,
    event_type: input.eventType,
    ip: input.ip ?? null,
    user_agent: input.userAgent ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("contract audit:", error.message);
}

function signUrl(origin: string, locale: string, token: string) {
  return `${origin.replace(/\/$/, "")}/${locale}/sign/${encodeURIComponent(token)}`;
}

async function loadHostPresign(
  organizationId: string,
  userId: string,
  consultantName: string,
  dek: Buffer,
) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("staff_contract_signatures")
    .select("presign_all, signature_kind, signature_text, signature_image")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.presign_all || !data.signature_kind) return null;
  const decrypted = decryptStaffContractSignature(data, dek);
  const typedName = (decrypted.signature_text ?? "").trim();
  if (typedName.length < 2 || !namesMatch(typedName, consultantName)) {
    return null;
  }
  if (data.signature_kind === "drawn") {
    if (!isPngSignatureDataUrl(decrypted.signature_image)) return null;
    return {
      kind: "drawn" as const,
      typedName,
      image: decrypted.signature_image as string,
    };
  }
  return { kind: "typed" as const, typedName, image: null as string | null };
}

async function sendSignerEmail(input: {
  locale: string;
  organizationName: string;
  organizationId: string;
  to: string;
  signerName: string;
  contractTitle: string;
  signUrl: string;
  role: "client" | "consultant";
  envelopeId: string;
  projectId?: string | null;
  replyToUserId?: string | null;
}) {
  const { sendContractSignatureRequestEmail } = await import(
    "@/lib/email/contract-signature"
  );
  await sendContractSignatureRequestEmail(input);
}

export async function issueContractsForAppointment(appointmentId: string) {
  const admin = createServiceClient();
  const { data: appointment, error: appointmentError } = await admin
    .from("booking_appointments")
    .select(
      "id, organization_id, service_id, host_user_id, starts_at, ends_at, status, guest_name, guest_email, guest_phone, guest_address, guest_preferred_locale, form_answers, meet_join_url, project_id",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) {
    console.error("issue contracts appointment:", appointmentError.message);
    return { issued: 0 };
  }
  if (
    !appointment ||
    (appointment.status !== "confirmed" &&
      appointment.status !== "pending_payment")
  ) {
    return { issued: 0 };
  }

  const [{ data: links }, { data: existing }] = await Promise.all([
    admin
      .from("contract_template_services")
      .select("template_id")
      .eq("service_id", appointment.service_id)
      .eq("organization_id", appointment.organization_id),
    admin
      .from("contract_envelopes")
      .select("template_id, status")
      .eq("appointment_id", appointmentId),
  ]);
  const templateIds = [...new Set((links ?? []).map((row) => row.template_id))];
  if (templateIds.length === 0) return { issued: 0 };

  const activeExisting = new Set(
    (existing ?? [])
      .filter((row) =>
        ["sent", "viewed", "partially_signed", "completed"].includes(row.status),
      )
      .map((row) => row.template_id),
  );

  const { data: templates } = await admin
    .from("contract_templates")
    .select("*")
    .eq("organization_id", appointment.organization_id)
    .eq("is_active", true)
    .eq("send_on_booking", true)
    .in("id", templateIds);
  const toIssue = (templates ?? []).filter((row) => !activeExisting.has(row.id));
  if (toIssue.length === 0) return { issued: 0 };

  const [dek, orgRes, settingsRes, serviceRes, hostRes] = await Promise.all([
    getOrgDataKey(appointment.organization_id),
    admin
      .from("organizations")
      .select("name, default_locale")
      .eq("id", appointment.organization_id)
      .maybeSingle(),
    admin
      .from("booking_settings")
      .select("timezone")
      .eq("organization_id", appointment.organization_id)
      .maybeSingle(),
    admin
      .from("booking_services")
      .select("id, title, translations, duration_minutes")
      .eq("id", appointment.service_id)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", appointment.host_user_id)
      .maybeSingle(),
  ]);

  const guest = decryptBookingGuestRow(
    {
      guest_name: appointment.guest_name as string,
      guest_email: appointment.guest_email as string,
      guest_phone: appointment.guest_phone as string,
      guest_address: appointment.guest_address as string,
    },
    dek,
  );
  const formAnswers = decryptBookingFormAnswers(appointment.form_answers, dek);
  const locale = toAppLocale(
    appointment.guest_preferred_locale ||
      formAnswers.preferred_language ||
      orgRes.data?.default_locale ||
      "en",
  );
  const timeZone = settingsRes.data?.timezone ?? "America/Toronto";
  const organizationName = orgRes.data?.name ?? product.name;
  const consultantName =
    hostRes.data?.full_name?.trim() || hostRes.data?.email || "Consultant";
  const consultantEmail = hostRes.data?.email ?? "";
  const origin = await getAppBaseUrl();
  let issued = 0;
  const orgDefaultLocale = orgRes.data?.default_locale ?? "en";

  for (const template of toIssue) {
    const picked = pickContractBody({
      translations: template.translations,
      fallbackHtml: String(template.body_html ?? ""),
      preferredLocale: locale,
      orgDefaultLocale,
    });
    const resolvedServiceTitle = serviceTitle(serviceRes.data, picked.locale);
    const vars = contractMergeVariables({
      locale: picked.locale,
      timeZone,
      customerName: guest.guest_name,
      customerEmail: guest.guest_email,
      customerPhone: guest.guest_phone,
      customerAddress: guest.guest_address,
      serviceName: resolvedServiceTitle,
      consultantName,
      consultantEmail,
      organizationName,
      startsAt: new Date(appointment.starts_at as string),
      durationMinutes: serviceRes.data?.duration_minutes ?? 30,
      meetJoinUrl: appointment.meet_join_url as string | null,
      formAnswers,
    });
    const filledHtml = fillContractHtml(picked.html, vars);
    const filledSha256 = sha256Hex(filledHtml);
    const expiresAt = new Date(
      Date.now() + CONTRACT_EXPIRES_DAYS * 86_400_000,
    ).toISOString();
    const { data: envelope, error: envelopeError } = await admin
      .from("contract_envelopes")
      .insert({
        organization_id: appointment.organization_id,
        template_id: template.id,
        appointment_id: appointmentId,
        title: template.title,
        filled_html: encryptContractFilledHtml(filledHtml, dek),
        filled_sha256: filledSha256,
        status: "sent",
        locale,
        expires_at: expiresAt,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (envelopeError || !envelope) {
      if (envelopeError?.code !== "23505") {
        console.error("issue contract envelope:", envelopeError?.message);
      }
      continue;
    }

    const clientToken = createBookingToken();
    const clientPii = encryptContractSignerWrite(
      { full_name: guest.guest_name, email: guest.guest_email },
      dek,
    );
    const clientTokenEnc = encryptContractSignatureWrite(
      { token: clientToken },
      dek,
    );
    const signers: Record<string, unknown>[] = [
      {
        organization_id: appointment.organization_id,
        envelope_id: envelope.id,
        role: "client",
        sort_order: 0,
        ...clientPii,
        token_hash: hashBookingToken(clientToken),
        token_encrypted: clientTokenEnc.token_encrypted,
        status: "pending",
      },
    ];
    if (template.require_consultant_signature) {
      const consultantPii = encryptContractSignerWrite(
        { full_name: consultantName, email: consultantEmail || "none@invalid" },
        dek,
      );
      const presign = await loadHostPresign(
        appointment.organization_id as string,
        appointment.host_user_id as string,
        consultantName,
        dek,
      );
      const sealed = presign
        ? encryptContractSignatureWrite(
            {
              signature_text: presign.typedName,
              signature_image: presign.image,
            },
            dek,
          )
        : null;
      const now = new Date().toISOString();
      signers.push({
        organization_id: appointment.organization_id,
        envelope_id: envelope.id,
        role: "consultant",
        sort_order: 1,
        ...consultantPii,
        status: presign ? "signed" : "pending",
        signed_at: presign ? now : null,
        signature_kind: presign?.kind ?? null,
        signature_text: sealed?.signature_text ?? null,
        signature_image: sealed?.signature_image ?? null,
        consent_accepted_at: presign ? now : null,
        consent_version: presign ? CONTRACT_CONSENT_VERSION : null,
      });
    }

    const { error: signerError } = await admin
      .from("contract_signers")
      .insert(signers);
    if (signerError) {
      console.error("issue contract signers:", signerError.message);
      await admin.from("contract_envelopes").delete().eq("id", envelope.id);
      continue;
    }

    await appendContractAudit({
      organizationId: appointment.organization_id as string,
      envelopeId: envelope.id,
      eventType: "sent",
      metadata: { templateId: template.id },
    });
    if (
      template.require_consultant_signature &&
      signers.some((row) => row.role === "consultant" && row.status === "signed")
    ) {
      await appendContractAudit({
        organizationId: appointment.organization_id as string,
        envelopeId: envelope.id,
        eventType: "presigned",
        metadata: { templateId: template.id, role: "consultant" },
      });
    }

    await sendSignerEmail({
      locale,
      organizationName,
      organizationId: appointment.organization_id as string,
      to: guest.guest_email,
      signerName: guest.guest_name,
      contractTitle: template.title as string,
      signUrl: signUrl(origin, locale, clientToken),
      role: "client",
      envelopeId: envelope.id as string,
      projectId: (appointment.project_id as string | null) ?? null,
      replyToUserId: appointment.host_user_id as string,
    });
    issued += 1;
  }

  return { issued };
}

export async function voidOpenContractsForAppointment(appointmentId: string) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("contract_envelopes")
    .select("id, organization_id")
    .eq("appointment_id", appointmentId)
    .in("status", ["sent", "viewed", "partially_signed"]);
  if (!data?.length) return;
  await admin
    .from("contract_envelopes")
    .update({ status: "voided", voided_at: now, updated_at: now })
    .eq("appointment_id", appointmentId)
    .in("status", ["sent", "viewed", "partially_signed"]);
  for (const row of data) {
    await appendContractAudit({
      organizationId: row.organization_id as string,
      envelopeId: row.id as string,
      eventType: "voided",
      metadata: { reason: "appointment_cancelled" },
    });
  }
}

export async function completeEnvelopeIfReady(envelopeId: string) {
  const admin = createServiceClient();
  const { data: envelope } = await admin
    .from("contract_envelopes")
    .select("*")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!envelope) return;
  const { data: signerRows } = await admin
    .from("contract_signers")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("sort_order", { ascending: true });
  const signers = signerRows ?? [];
  if (signers.length === 0 || signers.some((row) => row.status !== "signed")) {
    return;
  }

  const dek = await getOrgDataKey(envelope.organization_id as string);
  const filledHtml = decryptContractFilledHtml(
    envelope.filled_html as string,
    dek,
  );
  const decryptedSigners = signers.map((row) =>
    decryptContractSignatureFields(
      decryptContractSignerRow(row, dek),
      dek,
    ),
  );
  const { data: audit } = await admin
    .from("contract_audit_events")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("created_at", { ascending: true });
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", envelope.organization_id)
    .maybeSingle();

  const completedAt = new Date().toISOString();
  const pdf = await buildContractPdf({
    title: envelope.title as string,
    organizationName: org?.name ?? product.name,
    filledHtml,
    filledSha256: envelope.filled_sha256 as string,
    envelopeId,
    signers: decryptedSigners as never,
    audit: (audit ?? []) as never,
    completedAt,
  });

  const path = `${envelope.organization_id}/${envelopeId}/signed.pdf.enc`;
  const encrypted = encryptDocument(Buffer.from(pdf.bytes), dek);
  const { error: uploadError } = await admin.storage
    .from(CONTRACT_ENVELOPES_BUCKET)
    .upload(path, encrypted, {
      contentType: "application/octet-stream",
      upsert: true,
    });
  if (uploadError) {
    console.error("contract pdf upload:", uploadError.message);
    return;
  }

  await admin
    .from("contract_envelopes")
    .update({
      status: "completed",
      completed_at: completedAt,
      signed_pdf_storage_path: path,
      signed_pdf_sha256: pdf.sha256,
      updated_at: completedAt,
    })
    .eq("id", envelopeId);

  await appendContractAudit({
    organizationId: envelope.organization_id as string,
    envelopeId,
    eventType: "completed",
    metadata: { pdfSha256: pdf.sha256 },
  });

  const { sendContractCompletedEmail } = await import(
    "@/lib/email/contract-signature"
  );
  const locale = toAppLocale(envelope.locale as string);
  const { data: appointment } = envelope.appointment_id
    ? await admin
        .from("booking_appointments")
        .select("host_user_id, project_id")
        .eq("id", envelope.appointment_id)
        .maybeSingle()
    : { data: null };
  const hostUserId = (appointment?.host_user_id as string | null) ?? null;
  for (const signer of decryptedSigners) {
    if (!signer.email?.includes("@")) continue;
    await sendContractCompletedEmail({
      locale,
      organizationName: org?.name ?? product.name,
      organizationId: envelope.organization_id as string,
      to: signer.email,
      signerName: signer.full_name,
      contractTitle: envelope.title as string,
      pdfBytes: pdf.bytes,
      envelopeId,
      projectId: (appointment?.project_id as string | null) ?? null,
      replyToUserId: hostUserId,
      role: signer.role === "consultant" ? "consultant" : "client",
    });
  }
}

export async function notifyNextSigner(envelopeId: string) {
  const admin = createServiceClient();
  const { data: envelope } = await admin
    .from("contract_envelopes")
    .select("id, organization_id, title, locale, status")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!envelope || envelope.status === "completed" || envelope.status === "voided") {
    return;
  }
  const dek = await getOrgDataKey(envelope.organization_id as string);
  const { data: signerRows } = await admin
    .from("contract_signers")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("sort_order", { ascending: true });
  const next = (signerRows ?? []).find((row) => row.status !== "signed");
  if (!next || next.role !== "consultant") return;

  const signer = decryptContractSignerRow(next, dek);
  if (!signer.email?.includes("@")) return;

  const token = createBookingToken();
  const tokenEnc = encryptContractSignatureWrite({ token }, dek);
  await admin
    .from("contract_signers")
    .update({
      token_hash: hashBookingToken(token),
      token_encrypted: tokenEnc.token_encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", envelope.organization_id)
    .maybeSingle();
  const origin = await getAppBaseUrl();
  const locale = toAppLocale(envelope.locale as string);
  await sendSignerEmail({
    locale,
    organizationName: org?.name ?? product.name,
    organizationId: envelope.organization_id as string,
    to: signer.email ?? "",
    signerName: signer.full_name ?? "",
    contractTitle: envelope.title as string,
    signUrl: signUrl(origin, locale, token),
    role: "consultant",
    envelopeId,
  });
  await appendContractAudit({
    organizationId: envelope.organization_id as string,
    envelopeId,
    signerId: next.id as string,
    eventType: "consultant_requested",
  });
}
