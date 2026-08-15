"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import JSZip from "jszip";

import { getSessionUser } from "@/lib/auth/session";
import { getProjectParticipants, requireOrganizationId } from "@/lib/crm/queries";
import {
  assertProjectModifiable,
  isProjectModificationBlocked,
  loadProjectStatusById,
} from "@/lib/crm/project-lock";
import {
  CLIENT_DOCUMENTS_BUCKET,
  DOCUMENT_MAX_BYTES,
  guessMimeFromFilename,
  isAllowedDocumentMime,
  sanitizeUploadFilename,
} from "@/lib/documents/catalog";
import {
  downloadDecryptedDocument,
  ensureProjectDocumentsSeeded,
  listProjectDocumentRequests,
  listShareDocumentRequests,
  storeEncryptedDocument,
} from "@/lib/documents/service";
import {
  personDisplayName,
  resolveProjectShareUrl,
} from "@/lib/documents/share-url";
import { sendDocumentRejectionEmail } from "@/lib/email/document-rejection";
import { resolveShareToken } from "@/lib/ircc/project-forms";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  decryptDocumentRequestRow,
  decryptFilename,
  decryptPersonRow,
  decryptProjectRow,
  encryptDocumentRequestWrite,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type DocumentsActionState = {
  error?: string;
  message?: string;
};

const uuid = z.string().uuid();

export async function ensureProjectDocumentsSeededAction(
  organizationId: string,
  projectId: string,
  programFamily: string,
) {
  await ensureProjectDocumentsSeeded(organizationId, projectId, programFamily);
}

export async function addCustomDocumentRequestAction(
  _prev: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const personId = String(formData.get("personId") || "");
  const label = String(formData.get("label") || "").trim();
  const locale = String(formData.get("locale") || "en");
  const note = String(formData.get("consultantNote") || "").trim();

  if (
    !uuid.safeParse(projectId).success ||
    !uuid.safeParse(personId).success ||
    label.length < 1 ||
    label.length > 120
  ) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }

  const { data: participant } = await supabase
    .from("project_participants")
    .select("id")
    .eq("project_id", projectId)
    .eq("person_id", personId)
    .eq("organization_id", orgId)
    .is("left_at", null)
    .maybeSingle();

  if (!participant) return { error: "invalid" };

  const user = await getSessionUser();

  const { data: maxSort } = await supabase
    .from("project_document_requests")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("person_id", personId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("project_document_requests").insert({
    organization_id: orgId,
    project_id: projectId,
    person_id: personId,
    doc_key: "custom",
    ...encryptDocumentRequestWrite(
      {
        custom_label: label,
        consultant_note: note || null,
      },
      await getOrgDataKey(orgId),
    ),
    is_required: true,
    sort_order: (maxSort?.sort_order ?? 100) + 10,
    status: "requested",
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("addCustomDocumentRequest:", error.message);
    return { error: "add_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "added" };
}

export async function removeDocumentRequestAction(
  _prev: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const requestId = String(formData.get("requestId") || "");
  const projectId = String(formData.get("projectId") || "");
  const locale = String(formData.get("locale") || "en");

  if (!uuid.safeParse(requestId).success || !uuid.safeParse(projectId).success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }

  const { data: row } = await supabase
    .from("project_document_requests")
    .select("id")
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!row) return { error: "invalid" };

  const { data: file } = await supabase
    .from("project_document_files")
    .select("storage_path")
    .eq("request_id", requestId)
    .maybeSingle();

  const { data: deleted, error } = await supabase
    .from("project_document_requests")
    .delete()
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .select("id");

  if (error || !deleted?.length) {
    console.error("removeDocumentRequest:", error?.message ?? "no rows deleted");
    return { error: "remove_failed" };
  }

  if (file?.storage_path) {
    try {
      const { createServiceClient } = await import("@/lib/supabase/admin");
      const { CLIENT_DOCUMENTS_BUCKET } = await import(
        "@/lib/documents/catalog"
      );
      await createServiceClient()
        .storage.from(CLIENT_DOCUMENTS_BUCKET)
        .remove([file.storage_path as string]);
    } catch (err) {
      console.error("removeDocumentRequest storage:", err);
    }
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "removed" };
}

function documentLabelFromRow(row: {
  doc_key: string;
  custom_label: string | null;
}) {
  if (row.doc_key === "custom") {
    return row.custom_label?.trim() || "Document";
  }
  return row.doc_key;
}

async function deleteDocumentFileForRequest(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
) {
  const { data: file } = await supabase
    .from("project_document_files")
    .select("id, storage_path")
    .eq("request_id", requestId)
    .maybeSingle();

  if (!file?.storage_path) return;

  try {
    await createServiceClient()
      .storage.from(CLIENT_DOCUMENTS_BUCKET)
      .remove([file.storage_path as string]);
  } catch (err) {
    console.error("deleteDocumentFileForRequest storage:", err);
  }

  await supabase
    .from("project_document_files")
    .delete()
    .eq("id", file.id as string);
}

export async function reviewDocumentRequestAction(
  _prev: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const requestId = String(formData.get("requestId") || "");
  const projectId = String(formData.get("projectId") || "");
  const locale = String(formData.get("locale") || "en");
  const decision = String(formData.get("decision") || "");
  const comment = String(formData.get("comment") || "").trim();

  if (
    !uuid.safeParse(requestId).success ||
    !uuid.safeParse(projectId).success ||
    (decision !== "approve" && decision !== "deny")
  ) {
    return { error: "invalid" };
  }

  if (decision === "deny" && comment.length < 1) {
    return { error: "comment_required" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }

  const key = await getOrgDataKey(orgId);
  const { data: requestRow, error: requestError } = await supabase
    .from("project_document_requests")
    .select("*")
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (requestError || !requestRow) return { error: "invalid" };

  const request = decryptDocumentRequestRow(
    requestRow as {
      doc_key: string;
      custom_label: string | null;
      consultant_note: string | null;
      rejection_comment: string | null;
      status: string;
      person_id: string;
    },
    key,
  );

  if (decision === "approve" && request.status !== "uploaded") {
    return { error: "not_reviewable" };
  }

  if (
    decision === "deny" &&
    request.status !== "uploaded" &&
    request.status !== "accepted"
  ) {
    return { error: "not_reviewable" };
  }

  const { data: file } = await supabase
    .from("project_document_files")
    .select("id")
    .eq("request_id", requestId)
    .maybeSingle();

  if (!file) return { error: "not_reviewable" };

  const user = await getSessionUser();
  const documentName = documentLabelFromRow({
    doc_key: request.doc_key,
    custom_label: request.custom_label,
  });

  if (decision === "approve") {
    const { error } = await supabase
      .from("project_document_requests")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("organization_id", orgId);

    if (error) {
      console.error("reviewDocumentRequest approve:", error.message);
      return { error: "review_failed" };
    }
  } else {
    await deleteDocumentFileForRequest(supabase, requestId);

    const { error } = await supabase
      .from("project_document_requests")
      .update({
        status: "rejected",
        ...encryptDocumentRequestWrite({ rejection_comment: comment }, key),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("organization_id", orgId);

    if (error) {
      console.error("reviewDocumentRequest deny:", error.message);
      return { error: "review_failed" };
    }

    const [{ data: person }, { data: project }, { data: organization }] =
      await Promise.all([
        supabase
          .from("people")
          .select("first_name, last_name, email, preferred_locale")
          .eq("id", requestRow.person_id as string)
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("immigration_projects")
          .select("title")
          .eq("id", projectId)
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .maybeSingle(),
      ]);

    const decryptedPerson = person
      ? decryptPersonRow(person, key)
      : null;
    const decryptedProject = project
      ? decryptProjectRow(project, key)
      : null;
    const recipientEmail = decryptedPerson?.email?.trim();

    if (recipientEmail) {
      const shareUrl = await resolveProjectShareUrl(orgId, projectId, locale);
      const emailResult = await sendDocumentRejectionEmail({
        locale: decryptedPerson?.preferred_locale || locale,
        to: recipientEmail,
        clientName: personDisplayName(decryptedPerson ?? {}),
        organizationName: organization?.name || "Your consultant",
        projectTitle: decryptedProject?.title || "Your file",
        documentName,
        comment,
        shareUrl,
      });

      if (!emailResult.sent) {
        console.error("reviewDocumentRequest email:", emailResult.reason);
        return { error: "email_failed" };
      }
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action:
      decision === "approve"
        ? "document.approve"
        : "document.reject",
    resourceType: "project_document_request",
    resourceId: requestId,
    metadata: {
      projectId,
      personId: request.person_id,
      decision,
    },
  });

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "reviewed" };
}

export async function downloadProjectDocumentAction(
  requestId: string,
): Promise<
  | {
      ok: true;
      base64: string;
      filename: string;
      contentType: string;
    }
  | { ok: false; error: string }
> {
  if (!uuid.safeParse(requestId).success) {
    return { ok: false, error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("project_document_files")
    .select("*")
    .eq("request_id", requestId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !file) {
    return { ok: false, error: "not_found" };
  }

  try {
    const result = await downloadDecryptedDocument({
      organizationId: orgId,
      storagePath: file.storage_path as string,
      contentType: file.content_type as string,
      originalFilename: decryptFilename(
        file.original_filename as string,
        await getOrgDataKey(orgId),
      ),
    });
    const user = await getSessionUser();
    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: user?.id,
      actorKind: "staff",
      action: "document.download",
      resourceType: "project_document_file",
      resourceId: String(file.id),
      metadata: {
        requestId,
        projectId: file.project_id,
        personId: file.person_id,
      },
    });
    return {
      ok: true,
      base64: result.buffer.toString("base64"),
      filename: result.filename,
      contentType: result.contentType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("downloadProjectDocumentAction:", err);
    if (message === "decrypt_failed") {
      return { ok: false, error: "decrypt_failed" };
    }
    return { ok: false, error: "download_failed" };
  }
}

function zipPathSegment(value: string, fallback = "item"): string {
  const cleaned = value
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function uniqueZipPath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let n = 2;
  let next = `${stem}_${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}_${n}${ext}`;
  }
  used.add(next);
  return next;
}

export async function downloadAllProjectDocumentsAction(
  projectId: string,
): Promise<
  | {
      ok: true;
      base64: string;
      filename: string;
      contentType: string;
    }
  | { ok: false; error: string }
> {
  if (!uuid.safeParse(projectId).success) {
    return { ok: false, error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [requests, participants] = await Promise.all([
    listProjectDocumentRequests(projectId),
    getProjectParticipants(projectId),
  ]);

  if (requests.some((row) => row.organization_id !== orgId)) {
    return { ok: false, error: "unauthorized" };
  }

  const uploaded = requests.filter((row) => row.file);
  if (uploaded.length === 0) {
    return { ok: false, error: "no_files" };
  }

  const nameById = new Map(
    participants
      .filter((row) => row.person)
      .map((row) => [
        row.person!.id,
        `${row.person!.first_name} ${row.person!.last_name}`.trim(),
      ]),
  );

  const zip = new JSZip();
  const used = new Set<string>();
  let fileCount = 0;

  for (const row of uploaded) {
    const file = row.file!;
    try {
      const downloaded = await downloadDecryptedDocument({
        organizationId: orgId,
        storagePath: file.storage_path,
        contentType: file.content_type,
        originalFilename: file.original_filename,
      });
      const folder = zipPathSegment(
        nameById.get(row.person_id) || row.person_id.slice(0, 8),
        row.person_id.slice(0, 8),
      );
      const filename = zipPathSegment(downloaded.filename, "document");
      zip.file(uniqueZipPath(used, `${folder}/${filename}`), downloaded.buffer);
      fileCount += 1;
    } catch (err) {
      console.error("downloadAllProjectDocumentsAction file:", err);
    }
  }

  if (fileCount === 0) {
    return { ok: false, error: "download_failed" };
  }

  const user = await getSessionUser();
  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "document.download_all",
    resourceType: "immigration_project",
    resourceId: projectId,
    metadata: { fileCount },
  });

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  return {
    ok: true,
    base64: Buffer.from(bytes).toString("base64"),
    filename: `documents-${projectId.slice(0, 8)}.zip`,
    contentType: "application/zip",
  };
}

export async function downloadShareDocumentAction(
  token: string,
  requestId: string,
): Promise<
  | {
      ok: true;
      base64: string;
      filename: string;
      contentType: string;
    }
  | { ok: false; error: string }
> {
  if (!token || !uuid.safeParse(requestId).success) {
    return { ok: false, error: "invalid" };
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) return { ok: false, error: "expired" };

  const admin = createServiceClient();
  const { data: file, error } = await admin
    .from("project_document_files")
    .select("*")
    .eq("request_id", requestId)
    .eq("project_id", resolved.projectId)
    .eq("organization_id", resolved.organizationId)
    .maybeSingle();

  if (error || !file) {
    return { ok: false, error: "not_found" };
  }

  try {
    const result = await downloadDecryptedDocument({
      organizationId: resolved.organizationId,
      storagePath: file.storage_path as string,
      contentType: file.content_type as string,
      originalFilename: decryptFilename(
        file.original_filename as string,
        await getOrgDataKey(resolved.organizationId),
      ),
    });
    await recordAuditEvent({
      organizationId: resolved.organizationId,
      actorKind: "share_link",
      action: "document.download_share",
      resourceType: "project_document_file",
      resourceId: String(file.id),
      metadata: {
        requestId,
        projectId: resolved.projectId,
        shareLinkId: resolved.linkId,
      },
    });
    return {
      ok: true,
      base64: result.buffer.toString("base64"),
      filename: result.filename,
      contentType: result.contentType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("downloadShareDocumentAction:", err);
    if (message === "decrypt_failed") {
      return { ok: false, error: "decrypt_failed" };
    }
    return { ok: false, error: "download_failed" };
  }
}

export async function uploadShareDocumentAction(
  _prev: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const token = String(formData.get("token") || "");
  const requestId = String(formData.get("requestId") || "");
  const file = formData.get("file");

  const isBlob =
    typeof Blob !== "undefined" &&
    file instanceof Blob &&
    typeof (file as Blob).arrayBuffer === "function";
  if (!token || !uuid.safeParse(requestId).success || !isBlob) {
    return { error: "invalid" };
  }

  const blob = file as Blob & { name?: string };
  if (blob.size <= 0 || blob.size > DOCUMENT_MAX_BYTES) {
    return { error: "file_too_large" };
  }

  const filename =
    typeof blob.name === "string" && blob.name.trim()
      ? blob.name
      : "document";
  const contentType =
    (blob.type && isAllowedDocumentMime(blob.type) && blob.type) ||
    guessMimeFromFilename(filename) ||
    "";
  if (!isAllowedDocumentMime(contentType)) {
    return { error: "file_type" };
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) return { error: "expired" };

  let admin;
  try {
    admin = createServiceClient();
  } catch (err) {
    console.error("uploadShareDocumentAction admin:", err);
    return { error: "server_config" };
  }

  const { data: request, error: reqError } = await admin
    .from("project_document_requests")
    .select("*")
    .eq("id", requestId)
    .eq("project_id", resolved.projectId)
    .eq("organization_id", resolved.organizationId)
    .maybeSingle();

  if (reqError || !request) {
    return { error: "invalid" };
  }

  const projectStatus = await loadProjectStatusById(admin, resolved.projectId);
  if (isProjectModificationBlocked(projectStatus)) {
    return { error: "granted" };
  }

  if (request.status === "accepted") {
    return { error: "locked" };
  }

  const plaintext = Buffer.from(await blob.arrayBuffer());
  if (plaintext.length > DOCUMENT_MAX_BYTES) {
    return { error: "file_too_large" };
  }

  try {
    await storeEncryptedDocument({
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
      personId: request.person_id as string,
      requestId: request.id as string,
      plaintext,
      originalFilename: sanitizeUploadFilename(filename),
      contentType,
      uploadedVia: "share_link",
      client: admin,
    });
    const { notifyDocumentsUploaded } = await import(
      "@/lib/notifications/emit"
    );
    await notifyDocumentsUploaded({
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
    });
    await recordAuditEvent({
      organizationId: resolved.organizationId,
      actorKind: "share_link",
      action: "document.upload_share",
      resourceType: "project_document_request",
      resourceId: requestId,
      metadata: {
        projectId: resolved.projectId,
        personId: request.person_id,
        byteSize: plaintext.length,
        contentType,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("uploadShareDocumentAction:", message);
    if (
      message === "missing_encryption_key" ||
      message === "invalid_encryption_key"
    ) {
      return { error: "server_config" };
    }
    return { error: "upload_failed" };
  }

  return { message: "uploaded" };
}

export async function loadShareDocumentsAction(token: string) {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;
  const admin = createServiceClient();
  const requests = await listShareDocumentRequests(admin, resolved.projectId);
  return {
    projectId: resolved.projectId,
    expiresAt: resolved.expiresAt,
    requests,
  };
}
