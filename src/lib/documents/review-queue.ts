import type {
  DocumentDocKey,
  DocumentRequestStatus,
  ProjectStatus,
} from "@/db/schema";
import { requireOrganizationId } from "@/lib/crm/queries";
import { isTerminalStatus } from "@/lib/crm/statuses";
import type { DocumentFileRow, DocumentRequestRow } from "@/lib/documents/service";
import { personDisplayName } from "@/lib/documents/service";
import {
  decryptDocumentFileRow,
  decryptDocumentRequestRow,
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

export type DocumentReviewQueueItem = {
  requestId: string;
  projectId: string;
  projectTitle: string;
  personName: string;
  requestScope: "person" | "project";
  docKey: DocumentDocKey;
  customLabel: string | null;
  filename: string;
  sortOrder: number;
  status: Extract<DocumentRequestStatus, "uploaded">;
};

type ProjectLite = {
  id: string;
  title: string | null;
  status: ProjectStatus;
  destroyed_at: string | null;
};

export async function listDocumentsToReview(): Promise<DocumentReviewQueueItem[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data: requests, error: requestError } = await supabase
    .from("project_document_requests")
    .select("*")
    .eq("organization_id", orgId)
    .eq("status", "uploaded")
    .limit(200);

  if (requestError) {
    console.error("listDocumentsToReview requests:", requestError.message);
    return [];
  }

  const requestList = (requests ?? []) as DocumentRequestRow[];
  if (requestList.length === 0) return [];

  const projectIds = [...new Set(requestList.map((row) => row.project_id))];
  const { data: projectRows, error: projectError } = await supabase
    .from("immigration_projects")
    .select("id, title, status, destroyed_at")
    .eq("organization_id", orgId)
    .in("id", projectIds);

  if (projectError) {
    console.error("listDocumentsToReview projects:", projectError.message);
    return [];
  }

  const key = await getOrgDataKey(orgId);
  const openProjects = ((projectRows ?? []) as ProjectLite[])
    .map((row) => decryptProjectRow(row, key))
    .filter(
      (project) => !project.destroyed_at && !isTerminalStatus(project.status),
    );

  if (openProjects.length === 0) return [];

  const projectById = new Map(
    openProjects.map((project) => [project.id, project]),
  );
  const openIds = new Set(openProjects.map((project) => project.id));
  const openRequests = requestList.filter((row) => openIds.has(row.project_id));
  if (openRequests.length === 0) return [];

  const requestIds = openRequests.map((row) => row.id);
  const personIds = [...new Set(openRequests.map((row) => row.person_id))];

  const [{ data: files, error: fileError }, { data: people, error: peopleError }] =
    await Promise.all([
      supabase
        .from("project_document_files")
        .select("*")
        .eq("organization_id", orgId)
        .in("request_id", requestIds),
      supabase
        .from("people")
        .select("id, first_name, last_name, email")
        .eq("organization_id", orgId)
        .in("id", personIds),
    ]);

  if (fileError) {
    console.error("listDocumentsToReview files:", fileError.message);
    return [];
  }
  if (peopleError) {
    console.error("listDocumentsToReview people:", peopleError.message);
  }

  const fileByRequest = new Map(
    ((files ?? []) as DocumentFileRow[]).map((file) => [
      file.request_id,
      decryptDocumentFileRow(file, key),
    ]),
  );
  const personById = new Map(
    ((people ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>).map((row) => [row.id, decryptPersonRow(row, key)]),
  );

  const items: DocumentReviewQueueItem[] = [];
  for (const raw of openRequests) {
    const file = fileByRequest.get(raw.id);
    if (!file) continue;
    const project = projectById.get(raw.project_id);
    if (!project) continue;
    const request = decryptDocumentRequestRow(raw, key);
    const person = personById.get(raw.person_id);
    items.push({
      requestId: raw.id,
      projectId: raw.project_id,
      projectTitle: project.title || "Project",
      personName: personDisplayName(person ?? {}),
      requestScope: raw.request_scope === "project" ? "project" : "person",
      docKey: request.doc_key as DocumentDocKey,
      customLabel: request.custom_label,
      filename: file.original_filename,
      sortOrder: raw.sort_order,
      status: "uploaded",
    });
  }

  return items.sort((a, b) => {
    const projectDiff = a.projectTitle.localeCompare(b.projectTitle, undefined, {
      sensitivity: "base",
    });
    if (projectDiff !== 0) return projectDiff;
    const personDiff = a.personName.localeCompare(b.personName, undefined, {
      sensitivity: "base",
    });
    if (personDiff !== 0) return personDiff;
    return a.sortOrder - b.sortOrder;
  });
}
