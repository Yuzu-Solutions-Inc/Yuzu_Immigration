"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { DocumentReviewActions } from "@/components/documents/document-review-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/ui/status-pill";
import type { DocumentRequestStatus } from "@/db/schema";
import {
  base64ToBlob,
  isBrowserPreviewable,
  triggerBrowserDownload,
  type DocumentFilePayload,
} from "@/lib/documents/browser-file";

type FetchResult =
  | { ok: true; base64: string; filename: string; contentType: string }
  | { ok: false; error: string };

export type ProjectDocumentViewerItem = {
  requestId: string;
  filename: string;
  title: string;
  subtitle?: string;
  status: DocumentRequestStatus;
};

function pillForStatus(
  status: DocumentRequestStatus,
  t: ReturnType<typeof useTranslations<"documents">>,
): { label: string; tone: StatusPillTone } {
  if (status === "accepted") {
    return { label: t("pills.completed"), tone: "success" };
  }
  if (status === "uploaded") {
    return { label: t("pills.submitted"), tone: "action" };
  }
  if (status === "rejected") {
    return { label: t("pills.denied"), tone: "destructive" };
  }
  return { label: t("pills.waiting"), tone: "warning" };
}

export function ProjectDocumentViewer({
  open,
  onOpenChange,
  items,
  startIndex,
  fetchFile,
  projectId,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ProjectDocumentViewerItem[];
  startIndex: number;
  fetchFile: (requestId: string) => Promise<FetchResult>;
  projectId: string;
  locale: string;
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    (DocumentFilePayload & { url: string }) | null
  >(null);

  const index = useMemo(() => {
    if (!activeRequestId) return 0;
    const found = items.findIndex((item) => item.requestId === activeRequestId);
    return found >= 0 ? found : 0;
  }, [activeRequestId, items]);

  const current = items[index] ?? null;
  const canReview =
    current?.status === "uploaded" || current?.status === "accepted";

  const clearPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const closeViewer = useCallback(() => {
    clearPreview();
    onOpenChange(false);
  }, [clearPreview, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const nextIndex = Math.min(
      Math.max(startIndex, 0),
      Math.max(items.length - 1, 0),
    );
    setActiveRequestId(items[nextIndex]?.requestId ?? null);
  }, [open, startIndex]);

  function goToIndex(nextIndex: number) {
    const item = items[nextIndex];
    if (item) setActiveRequestId(item.requestId);
  }

  useEffect(() => {
    if (!open || !current) {
      clearPreview();
      return;
    }

    let cancelled = false;
    setError(null);
    clearPreview();

    startTransition(async () => {
      try {
        const result = await fetchFile(current.requestId);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const payload: DocumentFilePayload = {
          base64: result.base64,
          filename: result.filename,
          contentType: result.contentType,
        };
        if (!isBrowserPreviewable(payload.contentType)) {
          setError("preview_unsupported");
          return;
        }
        const blob = base64ToBlob(payload.base64, payload.contentType);
        const url = URL.createObjectURL(blob);
        setPreview({ ...payload, url });
      } catch {
        if (!cancelled) setError("download_failed");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, current?.requestId, fetchFile, clearPreview]);

  useEffect(() => {
    return () => clearPreview();
  }, [clearPreview]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        goToIndex(index - 1);
      }
      if (event.key === "ArrowRight" && index < items.length - 1) {
        event.preventDefault();
        goToIndex(index + 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, items.length]);

  if (items.length === 0) return null;

  const pill = current ? pillForStatus(current.status, t) : null;
  const errorMessage =
    error === "preview_unsupported"
      ? t("errors.previewUnsupported")
      : error === "decrypt_failed"
        ? t("errors.decryptFailed")
        : error
          ? t("errors.downloadFailed")
          : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeViewer();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] flex-col gap-3 sm:max-w-[min(96vw,56rem)]"
        showCloseButton
      >
        <DialogHeader className="gap-2 sm:pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-left">{t("viewerTitle")}</DialogTitle>
            {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
          </div>
          <DialogDescription className="text-left">
            {current ? (
              <>
                <span className="font-medium text-brand">{current.title}</span>
                {current.subtitle ? (
                  <span className="text-muted-foreground">
                    {` · ${current.subtitle}`}
                  </span>
                ) : null}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {current.filename}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-canvas">
          {pending && !preview ? (
            <div className="flex h-[min(70vh,40rem)] items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {errorMessage ? (
            <p
              className="p-6 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          {preview ? (
            preview.contentType === "application/pdf" ? (
              <iframe
                title={preview.filename}
                src={preview.url}
                className="h-[min(70vh,40rem)] w-full"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.filename}
                className="mx-auto max-h-[min(70vh,40rem)] w-auto max-w-full object-contain p-2"
              />
            )
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              disabled={index <= 0 || pending}
              onClick={() => goToIndex(index - 1)}
              aria-label={t("viewerPrevious")}
              title={t("viewerPrevious")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-[5.5rem] text-center text-sm text-muted-foreground tabular-nums">
              {t("viewerPosition", {
                current: index + 1,
                total: items.length,
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              disabled={index >= items.length - 1 || pending}
              onClick={() => goToIndex(index + 1)}
              aria-label={t("viewerNext")}
              title={t("viewerNext")}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {canReview && current ? (
            <DocumentReviewActions
              layout="dialog"
              requestId={current.requestId}
              projectId={projectId}
              locale={locale}
              status={current.status}
              onReviewed={() => router.refresh()}
            />
          ) : null}

          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!preview}
              onClick={() => {
                if (preview) triggerBrowserDownload(preview);
              }}
            >
              <Download className="size-4" />
              <span className="ml-1.5">{t("download")}</span>
            </Button>
            <Button type="button" onClick={closeViewer}>
              {t("closePreview")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
