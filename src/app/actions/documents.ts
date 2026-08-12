"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/crm/queries";
import {
  DOCUMENT_MAX_BYTES,
  isAllowedDocumentMime,
  sanitizeUploadFilename,
} from "@/lib/documents/catalog";
import {
  downloadDecryptedDocument,
  ensureProjectDocumentsSeeded,
  listShareDocumentRequests,
  storeEncryptedDocument,
} from "@/lib/documents/service";
import { resolveShareToken } from "@/lib/ircc/project-forms";
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

  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: participant } = await supabase
    .from("project_participants")
    .select("id")
    .eq("project_id", projectId)
    .eq("person_id", personId)
    .eq("organization_id", orgId)
    .is("left_at", null)
    .maybeSingle();

  if (!participant) return { error: "invalid" };

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
    custom_label: label,
    is_required: true,
    sort_order: (maxSort?.sort_order ?? 100) + 10,
    status: "requested",
    consultant_note: note || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("addCustomDocumentRequest:", error.message);
    return { error: "add_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "added" };
}

export async function removeCustomDocumentRequestAction(
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
  const { data: row } = await supabase
    .from("project_document_requests")
    .select("id, doc_key")
    .eq("id", requestId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!row || row.doc_key !== "custom") return { error: "invalid" };

  const { data: file } = await supabase
    .from("project_document_files")
    .select("storage_path")
    .eq("request_id", requestId)
    .maybeSingle();

  const { error } = await supabase
    .from("project_document_requests")
    .delete()
    .eq("id", requestId);

  if (error) {
    console.error("removeCustomDocumentRequest:", error.message);
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
      console.error("removeCustomDocumentRequest storage:", err);
    }
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "removed" };
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
      originalFilename: file.original_filename as string,
    });
    return {
      ok: true,
      base64: result.buffer.toString("base64"),
      filename: result.filename,
      contentType: result.contentType,
    };
  } catch (err) {
    console.error("downloadProjectDocumentAction:", err);
    return { ok: false, error: "download_failed" };
  }
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
      originalFilename: file.original_filename as string,
    });
    return {
      ok: true,
      base64: result.buffer.toString("base64"),
      filename: result.filename,
      contentType: result.contentType,
    };
  } catch (err) {
    console.error("downloadShareDocumentAction:", err);
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

  if (!token || !uuid.safeParse(requestId).success || !(file instanceof File)) {
    return { error: "invalid" };
  }

  if (file.size <= 0 || file.size > DOCUMENT_MAX_BYTES) {
    return { error: "file_too_large" };
  }

  const contentType = file.type || "application/octet-stream";
  if (!isAllowedDocumentMime(contentType)) {
    return { error: "file_type" };
  }

  const resolved = await resolveShareToken(token);
  if (!resolved) return { error: "expired" };

  const admin = createServiceClient();
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

  const plaintext = Buffer.from(await file.arrayBuffer());
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
      originalFilename: sanitizeUploadFilename(file.name),
      contentType,
      uploadedVia: "share_link",
      client: admin,
    });
  } catch (err) {
    console.error("uploadShareDocumentAction:", err);
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
