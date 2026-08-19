"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { downloadProjectDocumentAction } from "@/app/actions/documents";
import {
  ProjectDocumentViewer,
  type ProjectDocumentViewerItem,
} from "@/components/documents/project-document-viewer";
import { useRouter } from "@/i18n/navigation";
import type { DocumentReviewQueueItem } from "@/lib/documents/review-queue";

export function DocumentReviewScreen({
  items,
  startIndex,
  locale,
}: {
  items: DocumentReviewQueueItem[];
  startIndex: number;
  locale: string;
}) {
  const t = useTranslations("documents");
  const router = useRouter();

  const viewerItems = useMemo<ProjectDocumentViewerItem[]>(
    () =>
      items.map((item) => ({
        requestId: item.requestId,
        filename: item.filename,
        title:
          item.docKey === "custom"
            ? item.customLabel?.trim() || t("customFallback")
            : t(`keys.${item.docKey}`),
        subtitle:
          item.requestScope === "project"
            ? t("scopeProject")
            : item.personName || undefined,
        status: item.status,
        projectId: item.projectId,
        projectTitle: item.projectTitle,
      })),
    [items, t],
  );

  return (
    <ProjectDocumentViewer
      variant="page"
      open
      onOpenChange={(open) => {
        if (!open) router.push("/home");
      }}
      items={viewerItems}
      startIndex={startIndex}
      fetchFile={downloadProjectDocumentAction}
      projectId={viewerItems[0]?.projectId ?? items[0]?.projectId ?? ""}
      locale={locale}
    />
  );
}
