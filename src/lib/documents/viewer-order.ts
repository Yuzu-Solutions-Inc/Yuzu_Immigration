import type { DocumentRequestStatus } from "@/db/schema";
import type { DocumentRequestWithFile } from "@/lib/documents/service";

const VIEWER_STATUS_ORDER: Record<DocumentRequestStatus, number> = {
  uploaded: 0,
  rejected: 1,
  accepted: 2,
  requested: 3,
};

/** Submitted first, then denied, then approved — only rows with a file. */
export function sortDocumentsForViewer(
  requests: DocumentRequestWithFile[],
  personOrder: string[],
): DocumentRequestWithFile[] {
  const personIndex = new Map(personOrder.map((id, index) => [id, index]));

  return requests
    .filter((row) => row.file)
    .sort((a, b) => {
      const statusDiff =
        VIEWER_STATUS_ORDER[a.status] - VIEWER_STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;

      const personDiff =
        (personIndex.get(a.person_id) ?? 999) -
        (personIndex.get(b.person_id) ?? 999);
      if (personDiff !== 0) return personDiff;

      return a.sort_order - b.sort_order;
    });
}
