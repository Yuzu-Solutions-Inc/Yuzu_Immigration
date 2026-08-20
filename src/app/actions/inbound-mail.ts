"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { storeEncryptedDocument } from "@/lib/documents/service";
import { decryptDocument } from "@/lib/documents/crypto";
import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import {
  inboundAddressForLocalPart,
} from "@/lib/email/inbound-address";
import { emailIdempotencyKey, sendResendEmail } from "@/lib/email/resend";
import {
  decryptInboundFilename,
  decryptInboundMessageRow,
  encryptInboundMessageWrite,
} from "@/lib/security/client-pii";
import { hashEmailLookup } from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/security/audit";

export type InboundMailActionState = { error?: string; message?: string };

async function requireStaff() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership, user };
}

export async function assignInboundMessageAction(
  _prev: InboundMailActionState,
  formData: FormData,
): Promise<InboundMailActionState> {
  const parsed = z
    .object({
      locale: z.string().min(2),
      messageId: z.string().uuid(),
      projectId: z.string().uuid().optional().or(z.literal("")),
      personId: z.string().uuid().optional().or(z.literal("")),
    })
    .safeParse({
      locale: formData.get("locale"),
      messageId: formData.get("messageId"),
      projectId: String(formData.get("projectId") ?? ""),
      personId: String(formData.get("personId") ?? ""),
    });
  if (!parsed.success) return { error: "invalid" };
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const orgId = staff.membership.organization.id;
  const projectId = parsed.data.projectId || null;
  const personId = parsed.data.personId || null;
  if (!projectId && !personId) return { error: "invalid" };

  const assignmentStatus = projectId ? "project" : "person";
  const supabase = await createClient();
  const { error } = await supabase
    .from("inbound_messages")
    .update({
      project_id: projectId,
      person_id: personId,
      assignment_status: assignmentStatus,
    })
    .eq("id", parsed.data.messageId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("assign inbound:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsed.data.locale}/inbox`);
  if (projectId) revalidatePath(`/${parsed.data.locale}/projects/${projectId}`);
  if (personId) revalidatePath(`/${parsed.data.locale}/clients/${personId}`);
  return { message: "assigned" };
}

export async function replyInboundMessageAction(
  _prev: InboundMailActionState,
  formData: FormData,
): Promise<InboundMailActionState> {
  const parsed = z
    .object({
      locale: z.string().min(2),
      messageId: z.string().uuid(),
      body: z.string().trim().min(1).max(20_000),
    })
    .safeParse({
      locale: formData.get("locale"),
      messageId: formData.get("messageId"),
      body: formData.get("body"),
    });
  if (!parsed.success) return { error: "invalid" };
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const orgId = staff.membership.organization.id;
  const supabase = await createClient();
  const { data: message, error } = await supabase
    .from("inbound_messages")
    .select(
      "id, organization_id, project_id, person_id, from_email, subject, rfc_message_id, to_local_part, assignment_status",
    )
    .eq("id", parsed.data.messageId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !message) return { error: "not_found" };
  if (!message.project_id) return { error: "unassigned" };

  const key = await getOrgDataKey(orgId);
  const decrypted = decryptInboundMessageRow(
    { from_email: message.from_email as string, subject: message.subject as string, body_text: "" },
    key,
  );
  const to = decrypted.from_email?.trim();
  if (!to?.includes("@")) return { error: "invalid" };

  const fromAddress = inboundAddressForLocalPart(message.to_local_part as string);
  if (!fromAddress) return { error: "not_configured" };

  const subject = decrypted.subject?.startsWith("Re:")
    ? decrypted.subject
    : `Re: ${decrypted.subject || ""}`.trim();
  const orgName = staff.membership.organization.name;
  const fromDisplay = `${orgName} <${fromAddress}>`;
  const sealed = encryptInboundMessageWrite(
    { from_email: fromAddress, subject, body_text: parsed.data.body },
    key,
  );

  const sent = await sendResendEmail({
    to,
    subject,
    html: `<p style="white-space:pre-wrap">${parsed.data.body
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")}</p>`,
    text: parsed.data.body,
    kind: "inbound-reply",
    idempotencyKey: emailIdempotencyKey(
      "inbound-reply",
      parsed.data.messageId,
      parsed.data.body,
    ),
    organizationName: orgName,
    organizationId: orgId,
    locale: parsed.data.locale,
    includeDoNotReply: false,
    from: fromDisplay,
    replyTo: fromAddress,
    automated: false,
    inReplyTo: (message.rfc_message_id as string | null) ?? undefined,
  });
  if (!sent.sent) return { error: "email_failed" };

  const admin = createServiceClient();
  await admin.from("inbound_messages").insert({
    organization_id: orgId,
    project_id: message.project_id,
    person_id: message.person_id,
    assignment_status: "project",
    direction: "outbound",
    unknown_sender: false,
    resend_email_id: sent.id,
    from_email_lookup_hash: hashEmailLookup(orgId, fromAddress, key),
    from_email: sealed.from_email,
    to_address: to,
    to_local_part: message.to_local_part,
    subject: sealed.subject,
    body_text: sealed.body_text,
    in_reply_to: message.rfc_message_id,
    received_at: new Date().toISOString(),
    created_by: staff.user.id,
  });

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: staff.user.id,
    actorKind: "staff",
    action: "inbound.email.reply",
    resourceType: "inbound_message",
    resourceId: parsed.data.messageId,
    metadata: { projectId: message.project_id },
  });

  revalidatePath(`/${parsed.data.locale}/projects/${message.project_id}`);
  return { message: "sent" };
}

export async function fileInboundAttachmentAction(
  _prev: InboundMailActionState,
  formData: FormData,
): Promise<InboundMailActionState> {
  const parsed = z
    .object({
      locale: z.string().min(2),
      attachmentId: z.string().uuid(),
      requestId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale"),
      attachmentId: formData.get("attachmentId"),
      requestId: formData.get("requestId"),
    });
  if (!parsed.success) return { error: "invalid" };
  const staff = await requireStaff();
  if (!staff.ok) return { error: staff.error };

  const orgId = staff.membership.organization.id;
  const supabase = await createClient();
  const { data: attachment, error } = await supabase
    .from("inbound_attachments")
    .select(
      "id, organization_id, message_id, filename, content_type, storage_path, skipped, filed_request_id",
    )
    .eq("id", parsed.data.attachmentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !attachment || attachment.skipped || !attachment.storage_path) {
    return { error: "not_found" };
  }

  const { data: message } = await supabase
    .from("inbound_messages")
    .select("id, project_id")
    .eq("id", attachment.message_id as string)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!message?.project_id) return { error: "unassigned" };

  const { data: request } = await supabase
    .from("project_document_requests")
    .select("id, project_id, person_id")
    .eq("id", parsed.data.requestId)
    .eq("organization_id", orgId)
    .eq("project_id", message.project_id)
    .maybeSingle();
  if (!request) return { error: "not_found" };

  const admin = createServiceClient();
  const { data: blob, error: downloadError } = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .download(attachment.storage_path as string);
  if (downloadError || !blob) return { error: "save_failed" };

  const key = await getOrgDataKey(orgId);
  const plaintext = decryptDocument(
    Buffer.from(await blob.arrayBuffer()),
    key,
  );
  try {
    await storeEncryptedDocument({
      organizationId: orgId,
      projectId: request.project_id as string,
      personId: request.person_id as string,
      requestId: request.id as string,
      plaintext,
      originalFilename: decryptInboundFilename(attachment.filename as string, key),
      contentType: (attachment.content_type as string) || "application/octet-stream",
      uploadedVia: "email",
      client: admin,
    });
  } catch (error) {
    console.error("file inbound attachment:", error);
    return { error: "save_failed" };
  }

  await admin
    .from("inbound_attachments")
    .update({ filed_request_id: request.id })
    .eq("id", attachment.id);

  revalidatePath(`/${parsed.data.locale}/projects/${request.project_id}`);
  return { message: "filed" };
}

export async function downloadInboundAttachmentAction(attachmentId: string): Promise<
  | { ok: true; base64: string; filename: string; contentType: string }
  | { ok: false; error: string }
> {
  const staff = await requireStaff();
  if (!staff.ok) return { ok: false, error: staff.error };

  const orgId = staff.membership.organization.id;
  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("inbound_attachments")
    .select("filename, content_type, storage_path, skipped")
    .eq("id", attachmentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!attachment || attachment.skipped || !attachment.storage_path) {
    return { ok: false, error: "not_found" };
  }

  const admin = createServiceClient();
  const { data: blob, error } = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .download(attachment.storage_path as string);
  if (error || !blob) return { ok: false, error: "save_failed" };

  const key = await getOrgDataKey(orgId);
  const plaintext = decryptDocument(
    Buffer.from(await blob.arrayBuffer()),
    key,
  );
  return {
    ok: true,
    base64: plaintext.toString("base64"),
    filename: decryptInboundFilename(attachment.filename as string, key),
    contentType: (attachment.content_type as string) || "application/octet-stream",
  };
}
