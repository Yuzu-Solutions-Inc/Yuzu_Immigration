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
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import {
  StatusPill,
  type StatusPillTone,
} from "@/components/ui/status-pill";
import type { DocumentRequestStatus } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import {
  base64ToBlob,
  isBrowserPreviewable,
  triggerBrowserDownload,
  type DocumentFilePayload,
} from "@/lib/documents/browser-file";
import { nextPendingReviewRequestId } from "@/lib/documents/viewer-order";

type FetchResult =
  | { ok: true; base64: string; filename: string; contentType: string }
  | { ok: false; error: string };

export type ProjectDocumentViewerItem = {
  requestId: string;
  filename: string;
  title: string;
  subtitle?: string;
  status: DocumentRequestStatus;
  projectId?: string;
  projectTitle?: string;
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
  modificationBlocked = false,
  variant = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ProjectDocumentViewerItem[];
  startIndex: number;
  fetchFile: (requestId: string) => Promise<FetchResult>;
  projectId: string;
  locale: string;
  modificationBlocked?: boolean;
  variant?: "dialog" | "page";
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
  const currentProjectId = current?.projectId ?? projectId;
  const canReview =
    !modificationBlocked &&
    (current?.status === "uploaded" || current?.status === "accepted");

  const projectOptions = useMemo(() => {
    const counts = new Map<string, { title: string; count: number }>();
    for (const item of items) {
      if (!item.projectId || item.status !== "uploaded") continue;
      const prev = counts.get(item.projectId);
      counts.set(item.projectId, {
        title: item.projectTitle || prev?.title || "",
        count: (prev?.count ?? 0) + 1,
      });
    }
    return [...counts.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
  }, [items]);

  const showProjectSelect = projectOptions.length > 1;

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

  useEffect(() => {
    if (!open || items.length === 0) return;
    if (
      activeRequestId &&
      items.some((item) => item.requestId === activeRequestId)
    ) {
      return;
    }
    setActiveRequestId(items[0]?.requestId ?? null);
  }, [open, items, activeRequestId]);

  function goToIndex(nextIndex: number) {
    const item = items[nextIndex];
    if (item) setActiveRequestId(item.requestId);
  }

  function jumpToProject(nextProjectId: string) {
    const uploaded = items.findIndex(
      (item) =>
        item.projectId === nextProjectId && item.status === "uploaded",
    );
    const any = items.findIndex((item) => item.projectId === nextProjectId);
    goToIndex(uploaded >= 0 ? uploaded : any);
  }

  const handleReviewed = useCallback(() => {
    const nextId = nextPendingReviewRequestId(
      items,
      index,
      current?.requestId,
    );
    if (nextId) setActiveRequestId(nextId);
    router.refresh();
  }, [current?.requestId, index, items, router]);

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

  const projectSelect = showProjectSelect ? (
    <Field density="compact" className="min-w-[14rem] max-w-[22rem]">
      <FieldLabel htmlFor="review-project" density="compact">
        {t("review.projectLabel")}
      </FieldLabel>
      <NativeSelect
        id="review-project"
        density="compact"
        value={
          projectOptions.some((option) => option.id === currentProjectId)
            ? currentProjectId
            : (projectOptions[0]?.id ?? "")
        }
        onChange={(event) => jumpToProject(event.target.value)}
      >
        {projectOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {t("review.projectOption", {
              title: option.title,
              count: option.count,
            })}
          </option>
        ))}
      </NativeSelect>
    </Field>
  ) : null;

  const titleText =
    variant === "page" ? t("review.queueTitle") : t("viewerTitle");

  const description = current ? (
    <>
      <span className="font-medium text-brand">{current.title}</span>
      {current.subtitle ? (
        <span className="text-muted-foreground">{` · ${current.subtitle}`}</span>
      ) : null}
      {variant === "page" && current.projectTitle ? (
        <span className="text-muted-foreground">{` · ${current.projectTitle}`}</span>
      ) : null}
      <span className="mt-1 block text-xs text-muted-foreground">
        {current.filename}
      </span>
    </>
  ) : null;

  const previewPane = (
    <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-canvas">
      {pending && !preview ? (
        <div className="flex h-[min(70vh,40rem)] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {errorMessage ? (
        <p className="p-6 text-sm text-destructive" role="alert">
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
  );

  const toolbar = (
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
          key={current.requestId}
          layout="dialog"
          requestId={current.requestId}
          projectId={currentProjectId}
          locale={locale}
          status={current.status}
          onReviewed={handleReviewed}
        />
      ) : null}

      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {variant === "page" && currentProjectId ? (
          <Link
            href={`/projects/${currentProjectId}`}
            className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-action hover:underline"
          >
            {t("review.openProject")}
          </Link>
        ) : null}
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
          {variant === "page" ? t("review.done") : t("closePreview")}
        </Button>
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold text-brand">
                {titleText}
              </h1>
              {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
            </div>
            <p className="text-sm text-muted-foreground">{t("review.queueHelp")}</p>
            {current ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {projectSelect}
        </div>
        {previewPane}
        {toolbar}
      </div>
    );
  }

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
            <DialogTitle className="text-left">{titleText}</DialogTitle>
            {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
          </div>
          {projectSelect}
          <DialogDescription className="text-left">
            {description}
          </DialogDescription>
        </DialogHeader>
        {previewPane}
        {toolbar}
      </DialogContent>
    </Dialog>
  );
}
