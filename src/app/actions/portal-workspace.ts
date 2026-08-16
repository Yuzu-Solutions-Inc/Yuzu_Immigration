"use server";

import { z } from "zod";

import {
  DOCUMENT_MAX_BYTES,
  guessMimeFromFilename,
  isAllowedDocumentMime,
  sanitizeUploadFilename,
} from "@/lib/documents/catalog";
import {
  downloadDecryptedDocument,
  storeEncryptedDocument,
} from "@/lib/documents/service";
import {
  saveProjectAnswers,
  submitProjectQuestionnaire,
} from "@/lib/ircc/project-forms";
import {
  assertPortalProjectAccess,
  assertPortalSession,
} from "@/lib/portal/auth";
import {
  isProjectModificationBlocked,
  loadProjectStatusById,
} from "@/lib/crm/project-lock";
import { recordAuditEvent } from "@/lib/security/audit";
import { decryptFilename } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

import type { DocumentsActionState } from "./documents";
import type { FormsActionState } from "./forms";

const uuid = z.string().uuid();

async function requirePortalProject(projectId: string) {
  if (!uuid.safeParse(projectId).success) throw new Error("invalid");
  const session = await assertPortalSession();
  await assertPortalProjectAccess(session, projectId);
  return session;
}

export async function savePortalAnswersAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const personId = String(formData.get("personId") || "");
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "{}");

  if (!uuid.safeParse(projectId).success || !uuid.safeParse(personId).success) {
    return { error: "invalid" };
  }

  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(answersRaw) as Record<string, unknown>;
  } catch {
    return { error: "invalid" };
  }
  answers.hasRepresentative = "Y";

  try {
    const session = await requirePortalProject(projectId);
    await saveProjectAnswers({
      organizationId: session.organizationId,
      projectId,
      personId,
      answers,
      currentSection,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return { error: "auth_required" };
    }
    if (error instanceof Error && error.message === "granted") {
      return { error: "granted" };
    }
    return { error: "save_failed" };
  }

  return { message: "saved" };
}

export async function submitPortalQuestionnaireAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const personId = String(formData.get("personId") || "");
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "");

  if (!uuid.safeParse(projectId).success) return { error: "invalid" };

  let answers: Record<string, unknown> | undefined;
  if (answersRaw) {
    if (!uuid.safeParse(personId).success) return { error: "invalid" };
    try {
      answers = JSON.parse(answersRaw) as Record<string, unknown>;
      answers.hasRepresentative = "Y";
    } catch {
      return { error: "invalid" };
    }
  }

  try {
    const session = await requirePortalProject(projectId);
    const result = await submitProjectQuestionnaire({
      organizationId: session.organizationId,
      projectId,
      personId: answers ? personId : undefined,
      answers,
      currentSection: answers ? currentSection : undefined,
    });
    return { message: "submitted", submittedAt: result.submittedAt };
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return { error: "auth_required" };
    }
    if (error instanceof Error && error.message === "incomplete") {
      return { error: "incomplete" };
    }
    if (error instanceof Error && error.message === "granted") {
      return { error: "granted" };
    }
    return { error: "submit_failed" };
  }
}

export async function uploadPortalDocumentAction(
  _prev: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const requestId = String(formData.get("requestId") || "");
  const file = formData.get("file");
  const isBlob =
    typeof Blob !== "undefined" &&
    file instanceof Blob &&
    typeof (file as Blob).arrayBuffer === "function";
  if (
    !uuid.safeParse(projectId).success ||
    !uuid.safeParse(requestId).success ||
    !isBlob
  ) {
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

  let session;
  try {
    session = await requirePortalProject(projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return { error: "auth_required" };
    }
    return { error: "expired" };
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch (err) {
    console.error("uploadPortalDocumentAction admin:", err);
    return { error: "server_config" };
  }

  const { data: request, error: reqError } = await admin
    .from("project_document_requests")
    .select("*")
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (reqError || !request) return { error: "invalid" };

  const projectStatus = await loadProjectStatusById(admin, projectId);
  if (isProjectModificationBlocked(projectStatus)) {
    return { error: "granted" };
  }
  if (request.status === "accepted") return { error: "locked" };

  const plaintext = Buffer.from(await blob.arrayBuffer());
  if (plaintext.length > DOCUMENT_MAX_BYTES) {
    return { error: "file_too_large" };
  }

  try {
    await storeEncryptedDocument({
      organizationId: session.organizationId,
      projectId,
      personId: request.person_id as string,
      requestId: request.id as string,
      plaintext,
      originalFilename: sanitizeUploadFilename(filename),
      contentType,
      uploadedVia: "portal",
      client: admin,
    });
    const { notifyDocumentsUploaded } = await import(
      "@/lib/notifications/emit"
    );
    await notifyDocumentsUploaded({
      organizationId: session.organizationId,
      projectId,
    });
    void recordAuditEvent({
      organizationId: session.organizationId,
      actorKind: "portal",
      action: "document.upload_portal",
      resourceType: "project_document_request",
      resourceId: requestId,
      metadata: { projectId, personId: session.personId },
    }).catch((err) => console.error("portal upload audit:", err));
  } catch (err) {
    console.error("uploadPortalDocumentAction:", err);
    return { error: "upload_failed" };
  }

  return { message: "uploaded" };
}

export async function downloadPortalDocumentAction(
  projectId: string,
  requestId: string,
): Promise<
  | { ok: true; base64: string; filename: string; contentType: string }
  | { ok: false; error: string }
> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(requestId).success) {
    return { ok: false, error: "invalid" };
  }

  let session;
  try {
    session = await requirePortalProject(projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      return { ok: false, error: "auth_required" };
    }
    return { ok: false, error: "expired" };
  }

  const admin = createServiceClient();
  const { data: file, error } = await admin
    .from("project_document_files")
    .select("*")
    .eq("request_id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (error || !file) return { ok: false, error: "not_found" };

  try {
    const result = await downloadDecryptedDocument({
      organizationId: session.organizationId,
      storagePath: file.storage_path as string,
      contentType: file.content_type as string,
      originalFilename: decryptFilename(
        file.original_filename as string,
        await getOrgDataKey(session.organizationId),
      ),
    });
    void recordAuditEvent({
      organizationId: session.organizationId,
      actorKind: "portal",
      action: "document.download_portal",
      resourceType: "project_document_file",
      resourceId: String(file.id),
      metadata: { requestId, projectId },
    }).catch((err) => console.error("portal download audit:", err));
    return {
      ok: true,
      base64: result.buffer.toString("base64"),
      filename: result.filename,
      contentType: result.contentType,
    };
  } catch (err) {
    console.error("downloadPortalDocumentAction:", err);
    return { ok: false, error: "download_failed" };
  }
}
