import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentDocKey, DocumentRequestStatus } from "@/db/schema";
import {
  CLIENT_DOCUMENTS_BUCKET,
  defaultDocumentsForProgram,
} from "@/lib/documents/catalog";
import { decryptDocument, encryptDocument } from "@/lib/documents/crypto";
import {
  decryptDocumentFileRow,
  decryptDocumentRequestRow,
  encryptFilename,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type DocumentRequestRow = {
  id: string;
  organization_id: string;
  project_id: string;
  person_id: string;
  doc_key: DocumentDocKey;
  custom_label: string | null;
  is_required: boolean;
  sort_order: number;
  status: DocumentRequestStatus;
  consultant_note: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentFileRow = {
  id: string;
  organization_id: string;
  project_id: string;
  request_id: string;
  person_id: string;
  storage_path: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  encryption_alg: string;
  uploaded_via: string;
  created_at: string;
};

export type DocumentRequestWithFile = DocumentRequestRow & {
  file: DocumentFileRow | null;
};

function storagePath(input: {
  organizationId: string;
  projectId: string;
  personId: string;
  requestId: string;
  fileId: string;
}) {
  return `${input.organizationId}/${input.projectId}/${input.personId}/${input.requestId}/${input.fileId}.enc`;
}

export async function listProjectDocumentRequests(
  projectId: string,
): Promise<DocumentRequestWithFile[]> {
  const supabase = await createClient();
  const [{ data: requests, error: reqError }, { data: files, error: fileError }] =
    await Promise.all([
      supabase
        .from("project_document_requests")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("project_document_files")
        .select("*")
        .eq("project_id", projectId),
    ]);

  if (reqError) {
    console.error("listProjectDocumentRequests:", reqError.message);
    throw new Error(reqError.message);
  }
  if (fileError) {
    console.error("listProjectDocumentFiles:", fileError.message);
    throw new Error(fileError.message);
  }

  const filesByRequest = new Map(
    ((files ?? []) as DocumentFileRow[]).map((f) => [f.request_id, f]),
  );

  const orgId = ((requests ?? [])[0] as DocumentRequestRow | undefined)
    ?.organization_id;
  const key = orgId ? await getOrgDataKey(orgId) : Buffer.alloc(0);
  return ((requests ?? []) as DocumentRequestRow[]).map((row) => ({
    ...decryptDocumentRequestRow(row, key),
    file: filesByRequest.get(row.id)
      ? decryptDocumentFileRow(filesByRequest.get(row.id)!, key)
      : null,
  }));
}

export async function ensureProjectDocumentsSeeded(
  organizationId: string,
  projectId: string,
  programFamily: string,
  personIds?: string[],
) {
  const supabase = await createClient();
  let ids = personIds;
  if (!ids) {
    const { data: participants, error } = await supabase
      .from("project_participants")
      .select("person_id")
      .eq("project_id", projectId)
      .is("left_at", null);
    if (error) {
      console.error("ensureProjectDocumentsSeeded people:", error.message);
      throw new Error(error.message);
    }
    ids = (participants ?? []).map((p) => p.person_id as string);
  }
  if (ids.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("project_document_requests")
    .select("person_id, doc_key")
    .eq("project_id", projectId)
    .in("doc_key", ["passport", "photo"]);

  if (existingError) {
    console.error("ensureProjectDocumentsSeeded existing:", existingError.message);
    throw new Error(existingError.message);
  }

  const have = new Set(
    (existing ?? []).map((r) => `${r.person_id}:${r.doc_key}`),
  );
  const defaults = defaultDocumentsForProgram(programFamily);
  const inserts: Array<{
    organization_id: string;
    project_id: string;
    person_id: string;
    doc_key: string;
    is_required: boolean;
    sort_order: number;
    status: "requested";
  }> = [];

  for (const personId of ids) {
    for (const seed of defaults) {
      const key = `${personId}:${seed.docKey}`;
      if (have.has(key)) continue;
      inserts.push({
        organization_id: organizationId,
        project_id: projectId,
        person_id: personId,
        doc_key: seed.docKey,
        is_required: seed.isRequired,
        sort_order: seed.sortOrder,
        status: "requested",
      });
    }
  }

  if (inserts.length === 0) return;

  const { error } = await supabase
    .from("project_document_requests")
    .insert(inserts);
  if (error) {
    console.error("ensureProjectDocumentsSeeded insert:", error.message);
    throw new Error(error.message);
  }
}

export async function listShareDocumentRequests(
  admin: SupabaseClient,
  projectId: string,
): Promise<DocumentRequestWithFile[]> {
  const [{ data: requests, error: reqError }, { data: files, error: fileError }] =
    await Promise.all([
      admin
        .from("project_document_requests")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true }),
      admin
        .from("project_document_files")
        .select(
          "id, organization_id, project_id, request_id, person_id, original_filename, content_type, byte_size, uploaded_via, created_at, encryption_alg",
        )
        .eq("project_id", projectId),
    ]);

  if (reqError) {
    console.error("listShareDocumentRequests:", reqError.message);
    throw new Error(reqError.message);
  }
  if (fileError) {
    console.error("listShareDocumentFiles:", fileError.message);
    throw new Error(fileError.message);
  }

  type ShareFileMeta = Omit<DocumentFileRow, "storage_path"> & {
    storage_path?: string;
  };

  const filesByRequest = new Map(
    ((files ?? []) as ShareFileMeta[]).map((f) => [f.request_id, f]),
  );

  const orgId = ((requests ?? [])[0] as DocumentRequestRow | undefined)
    ?.organization_id;
  const key = orgId ? await getOrgDataKey(orgId) : Buffer.alloc(0);
  return ((requests ?? []) as DocumentRequestRow[]).map((row) => {
    const file = filesByRequest.get(row.id);
    return {
      ...decryptDocumentRequestRow(row, key),
      file: file
        ? decryptDocumentFileRow(
            {
              ...file,
              storage_path: "",
            } as DocumentFileRow,
            key,
          )
        : null,
    };
  });
}

export async function storeEncryptedDocument(input: {
  organizationId: string;
  projectId: string;
  personId: string;
  requestId: string;
  plaintext: Buffer;
  originalFilename: string;
  contentType: string;
  uploadedVia: "share_link" | "staff";
  client?: SupabaseClient;
}) {
  const admin = input.client ?? createServiceClient();
  const encrypted = encryptDocument(input.plaintext);
  const fileId = randomUUID();
  const path = storagePath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    personId: input.personId,
    requestId: input.requestId,
    fileId,
  });

  const { data: existing } = await admin
    .from("project_document_files")
    .select("id, storage_path")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (existing?.storage_path) {
    await admin.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .remove([existing.storage_path as string]);
    await admin
      .from("project_document_files")
      .delete()
      .eq("id", existing.id as string);
  }

  const { error: uploadError } = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(path, new Uint8Array(encrypted), {
      contentType: "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.error("storeEncryptedDocument upload:", uploadError.message);
    throw new Error(uploadError.message);
  }

  const { data: fileRow, error: insertError } = await admin
    .from("project_document_files")
    .insert({
      id: fileId,
      organization_id: input.organizationId,
      project_id: input.projectId,
      request_id: input.requestId,
      person_id: input.personId,
      storage_path: path,
      original_filename: encryptFilename(
        input.originalFilename,
        await getOrgDataKey(input.organizationId),
      ),
      content_type: input.contentType,
      byte_size: input.plaintext.length,
      encryption_alg: "aes-256-gcm",
      uploaded_via: input.uploadedVia,
    })
    .select("*")
    .single();

  if (insertError) {
    await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([path]);
    console.error("storeEncryptedDocument insert:", insertError.message);
    throw new Error(insertError.message);
  }

  const { error: statusError } = await admin
    .from("project_document_requests")
    .update({
      status: "uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.requestId);

  if (statusError) {
    console.error("storeEncryptedDocument status:", statusError.message);
  }

  return decryptDocumentFileRow(
    fileRow as DocumentFileRow,
    await getOrgDataKey(input.organizationId),
  );
}

export async function downloadDecryptedDocument(input: {
  organizationId: string;
  storagePath: string;
  contentType: string;
  originalFilename: string;
}) {
  const admin = createServiceClient();
  const { data, error } = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .download(input.storagePath);

  if (error || !data) {
    console.error("downloadDecryptedDocument:", error?.message);
    throw new Error(error?.message ?? "download_failed");
  }

  const encrypted = Buffer.from(await data.arrayBuffer());
  const plaintext = decryptDocument(encrypted);
  return {
    buffer: plaintext,
    contentType: input.contentType,
    filename: input.originalFilename,
  };
}
