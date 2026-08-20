import "server-only";

import { randomUUID } from "node:crypto";
import { Resend } from "resend";

import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import { encryptDocument } from "@/lib/documents/crypto";
import {
  emailLocalPart,
  inboundMailDomain,
  isInboundDomainAddress,
  parseEmailAddress,
} from "@/lib/email/inbound-address";
import { notifyInboundEmail } from "@/lib/notifications/emit";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  encryptInboundFilename,
  encryptInboundMessageWrite,
} from "@/lib/security/client-pii";
import {
  hashEmailLookup,
  normalizeGuestEmail,
} from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { stripHtmlToPlainText } from "@/lib/html/sanitize";
import { createServiceClient } from "@/lib/supabase/admin";

const MAX_BODY_CHARS = 100_000;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_PER_SENDER = 30;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function emailPlaintext(text: string | null, html: string | null) {
  const raw = text?.trim() ? text : html ? stripHtmlToPlainText(html) : "";
  return raw.slice(0, MAX_BODY_CHARS);
}

function headerValue(
  headers: Record<string, string> | null | undefined,
  name: string,
) {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && value.trim()) return value.trim();
  }
  return null;
}

function collectRecipientEmails(input: {
  to?: string[] | null;
  cc?: string[] | null;
  received_for?: string[] | null;
}) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [
    ...(input.received_for ?? []),
    ...(input.to ?? []),
    ...(input.cc ?? []),
  ]) {
    const email = parseEmailAddress(raw);
    if (!email.includes("@") || seen.has(email)) continue;
    if (!isInboundDomainAddress(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

type RouteHit =
  | { kind: "project"; organizationId: string; projectId: string; to: string }
  | { kind: "org"; organizationId: string; to: string };

async function resolveRoute(admin: ReturnType<typeof createServiceClient>, recipients: string[]) {
  for (const to of recipients) {
    const local = emailLocalPart(to);
    if (local.startsWith("p_")) {
      const { data } = await admin
        .from("immigration_projects")
        .select("id, organization_id")
        .eq("inbound_local_part", local)
        .maybeSingle();
      if (data?.id && data.organization_id) {
        return {
          kind: "project" as const,
          organizationId: data.organization_id as string,
          projectId: data.id as string,
          to,
        };
      }
    }
    if (local.startsWith("o_")) {
      const { data } = await admin
        .from("organizations")
        .select("id")
        .eq("inbound_local_part", local)
        .maybeSingle();
      if (data?.id) {
        return {
          kind: "org" as const,
          organizationId: data.id as string,
          to,
        };
      }
    }
  }
  return null as RouteHit | null;
}

async function matchPersonInOrg(
  admin: ReturnType<typeof createServiceClient>,
  organizationId: string,
  fromEmail: string,
) {
  const key = await getOrgDataKey(organizationId);
  const hash = hashEmailLookup(organizationId, fromEmail, key);
  const { data } = await admin
    .from("people")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email_lookup_hash", hash)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function openProjectsForPerson(
  admin: ReturnType<typeof createServiceClient>,
  organizationId: string,
  personId: string,
) {
  const { data } = await admin
    .from("project_participants")
    .select(
      "project_id, immigration_projects!inner(id, closed_at, destroyed_at)",
    )
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .is("left_at", null);
  const ids: string[] = [];
  for (const row of data ?? []) {
    const project = row.immigration_projects as
      | { id?: string; closed_at?: string | null; destroyed_at?: string | null }
      | {
          id?: string;
          closed_at?: string | null;
          destroyed_at?: string | null;
        }[]
      | null;
    const projects = Array.isArray(project) ? project : project ? [project] : [];
    for (const item of projects) {
      if (item.closed_at || item.destroyed_at) continue;
      if (item.id) ids.push(item.id);
    }
  }
  return [...new Set(ids)];
}

async function inheritFromThread(
  admin: ReturnType<typeof createServiceClient>,
  organizationId: string,
  inReplyTo: string | null,
) {
  if (!inReplyTo) return null;
  const { data } = await admin
    .from("inbound_messages")
    .select("project_id, person_id, assignment_status")
    .eq("organization_id", organizationId)
    .eq("rfc_message_id", inReplyTo)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    projectId: (data.project_id as string | null) ?? null,
    personId: (data.person_id as string | null) ?? null,
    assignmentStatus: data.assignment_status as
      | "project"
      | "person"
      | "unassigned",
  };
}

async function senderOverRate(
  admin: ReturnType<typeof createServiceClient>,
  organizationId: string,
  fromHash: string,
) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("inbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("from_email_lookup_hash", fromHash)
    .eq("direction", "inbound")
    .gte("received_at", since);
  return (count ?? 0) >= RATE_MAX_PER_SENDER;
}

async function storeAttachments(input: {
  resend: Resend;
  emailId: string;
  organizationId: string;
  messageId: string;
}) {
  const admin = createServiceClient();
  const key = await getOrgDataKey(input.organizationId);
  const listed = await input.resend.emails.receiving.attachments.list({
    emailId: input.emailId,
  });
  if (listed.error) {
    console.error("inbound attachments list:", listed.error.message);
    return;
  }

  const files = (listed.data?.data ?? []).filter(
    (att) => att.content_disposition !== "inline",
  );
  let total = 0;
  let stored = 0;

  for (const att of files) {
    if (stored >= MAX_ATTACHMENTS) {
      await admin.from("inbound_attachments").insert({
        organization_id: input.organizationId,
        message_id: input.messageId,
        filename: encryptInboundFilename(att.filename || "attachment", key),
        content_type: att.content_type || "application/octet-stream",
        byte_size: att.size,
        storage_path: "",
        skipped: true,
        skip_reason: "too_many",
      });
      continue;
    }
    if (att.size > MAX_ATTACHMENT_BYTES || total + att.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      await admin.from("inbound_attachments").insert({
        organization_id: input.organizationId,
        message_id: input.messageId,
        filename: encryptInboundFilename(att.filename || "attachment", key),
        content_type: att.content_type || "application/octet-stream",
        byte_size: att.size,
        storage_path: "",
        skipped: true,
        skip_reason: "too_large",
      });
      continue;
    }

    let bytes: Buffer;
    try {
      const response = await fetch(att.download_url);
      if (!response.ok) throw new Error(`download_${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error("inbound attachment download:", error);
      await admin.from("inbound_attachments").insert({
        organization_id: input.organizationId,
        message_id: input.messageId,
        filename: encryptInboundFilename(att.filename || "attachment", key),
        content_type: att.content_type || "application/octet-stream",
        byte_size: att.size,
        storage_path: "",
        skipped: true,
        skip_reason: "download_failed",
      });
      continue;
    }

    const attachmentId = randomUUID();
    const path = `${input.organizationId}/inbound/${input.messageId}/${attachmentId}.enc`;
    const encrypted = encryptDocument(bytes, key);
    const { error: uploadError } = await admin.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .upload(path, new Uint8Array(encrypted), {
        contentType: "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      console.error("inbound attachment upload:", uploadError.message);
      await admin.from("inbound_attachments").insert({
        organization_id: input.organizationId,
        message_id: input.messageId,
        filename: encryptInboundFilename(att.filename || "attachment", key),
        content_type: att.content_type || "application/octet-stream",
        byte_size: bytes.length,
        storage_path: "",
        skipped: true,
        skip_reason: "upload_failed",
      });
      continue;
    }

    await admin.from("inbound_attachments").insert({
      id: attachmentId,
      organization_id: input.organizationId,
      message_id: input.messageId,
      filename: encryptInboundFilename(att.filename || "attachment", key),
      content_type: att.content_type || "application/octet-stream",
      byte_size: bytes.length,
      storage_path: path,
      skipped: false,
    });
    total += bytes.length;
    stored += 1;
  }
}

export async function processReceivedEmail(emailId: string) {
  const domain = inboundMailDomain();
  const resend = getResend();
  if (!domain || !resend) {
    console.error("inbound email: not configured");
    return { ok: false as const, reason: "not_configured" };
  }

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("inbound_messages")
    .select("id")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (existing?.id) return { ok: true as const, duplicate: true };

  const { data: email, error } = await resend.emails.receiving.get(emailId);
  if (error || !email) {
    console.error("inbound email get:", error?.message ?? "missing");
    return { ok: false as const, reason: "fetch_failed" };
  }

  const recipients = collectRecipientEmails({
    to: email.to,
    cc: email.cc,
    received_for: email.received_for,
  });
  const route = await resolveRoute(admin, recipients);
  if (!route) {
    await recordAuditEvent({
      actorKind: "system",
      action: "inbound.email.unknown_alias",
      resourceType: "resend_email",
      resourceId: emailId,
      metadata: { to: recipients.slice(0, 5) },
    });
    return { ok: true as const, ignored: true };
  }

  const fromEmail = normalizeGuestEmail(parseEmailAddress(email.from));
  const orgKey = await getOrgDataKey(route.organizationId);
  const fromHash = hashEmailLookup(route.organizationId, fromEmail, orgKey);

  if (await senderOverRate(admin, route.organizationId, fromHash)) {
    await recordAuditEvent({
      organizationId: route.organizationId,
      actorKind: "system",
      action: "inbound.email.rate_limited",
      resourceType: "resend_email",
      resourceId: emailId,
      metadata: { fromHash },
    });
    return { ok: true as const, rateLimited: true };
  }

  const rfcMessageId = email.message_id || headerValue(email.headers, "message-id");
  const inReplyTo = headerValue(email.headers, "in-reply-to");
  const thread = await inheritFromThread(
    admin,
    route.organizationId,
    inReplyTo,
  );

  let projectId: string | null =
    route.kind === "project" ? route.projectId : thread?.projectId ?? null;
  let personId = await matchPersonInOrg(
    admin,
    route.organizationId,
    fromEmail,
  );
  const unknownSender = !personId;
  if (!personId && thread?.personId) personId = thread.personId;

  if (!projectId && personId) {
    const open = await openProjectsForPerson(
      admin,
      route.organizationId,
      personId,
    );
    if (open.length === 1) projectId = open[0]!;
  }

  const assignmentStatus: "project" | "person" | "unassigned" = projectId
    ? "project"
    : "unassigned";

  const sealed = encryptInboundMessageWrite(
    {
      from_email: fromEmail,
      subject: (email.subject || "(no subject)").slice(0, 500),
      body_text: emailPlaintext(email.text, email.html),
    },
    orgKey,
  );

  const { data: inserted, error: insertError } = await admin
    .from("inbound_messages")
    .insert({
      organization_id: route.organizationId,
      project_id: projectId,
      person_id: personId,
      assignment_status: assignmentStatus,
      direction: "inbound",
      unknown_sender: unknownSender,
      resend_email_id: emailId,
      from_email_lookup_hash: fromHash,
      from_email: sealed.from_email,
      to_address: route.to,
      to_local_part: emailLocalPart(route.to),
      subject: sealed.subject,
      body_text: sealed.body_text,
      rfc_message_id: rfcMessageId,
      in_reply_to: inReplyTo,
      received_at: email.created_at || new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError?.code === "23505") {
    return { ok: true as const, duplicate: true };
  }
  if (insertError || !inserted) {
    console.error("inbound message insert:", insertError?.message);
    return { ok: false as const, reason: "insert_failed" };
  }

  await storeAttachments({
    resend,
    emailId,
    organizationId: route.organizationId,
    messageId: inserted.id as string,
  });

  await notifyInboundEmail({
    organizationId: route.organizationId,
    projectId,
    messageId: inserted.id as string,
    unknownSender,
  });

  return { ok: true as const };
}
