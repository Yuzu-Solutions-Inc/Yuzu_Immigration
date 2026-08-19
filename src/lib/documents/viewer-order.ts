import type { DocumentRequestStatus } from "@/db/schema";
import type { DocumentRequestWithFile } from "@/lib/documents/service";

const VIEWER_STATUS_ORDER: Record<DocumentRequestStatus, number> = {
  uploaded: 0,
  rejected: 1,
  accepted: 2,
  requested: 3,
};

/** Next uploaded file after `fromIndex`, wrapping if earlier files remain. */
export function nextPendingReviewRequestId(
  items: Array<{ requestId: string; status: DocumentRequestStatus }>,
  fromIndex: number,
  skipRequestId?: string,
): string | null {
  const isPending = (item: {
    requestId: string;
    status: DocumentRequestStatus;
  }) => item.status === "uploaded" && item.requestId !== skipRequestId;

  for (let i = fromIndex + 1; i < items.length; i++) {
    const item = items[i];
    if (item && isPending(item)) return item.requestId;
  }
  for (let i = 0; i < fromIndex; i++) {
    const item = items[i];
    if (item && isPending(item)) return item.requestId;
  }
  return null;
}

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
