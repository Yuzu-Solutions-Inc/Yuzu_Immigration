"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { previewProjectFormPdfAction } from "@/app/actions/forms";
import { PdfReader } from "@/components/pdf/pdf-reader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  triggerBrowserDownload,
  type DocumentFilePayload,
} from "@/lib/documents/browser-file";

export type ProjectFormViewerItem = {
  id: string;
  title: string;
  subtitle: string;
};

export function ProjectFormPdfViewer({
  open,
  onOpenChange,
  items,
  startFormId,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ProjectFormViewerItem[];
  startFormId: string | null;
  projectId: string;
}) {
  const t = useTranslations("forms");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<DocumentFilePayload | null>(null);

  const currentId = open ? (activeId ?? startFormId) : null;
  const index = useMemo(() => {
    if (!currentId) return 0;
    const found = items.findIndex((item) => item.id === currentId);
    return found >= 0 ? found : 0;
  }, [currentId, items]);

  const current = items[index] ?? null;

  useEffect(() => {
    setActiveId(null);
  }, [startFormId]);

  useEffect(() => {
    if (!open || !currentId) return;

    let cancelled = false;
    setError(null);
    setWarnings([]);
    startTransition(async () => {
      try {
        const result = await previewProjectFormPdfAction(projectId, currentId);
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setPreview(null);
          return;
        }
        setPreview({
          base64: result.base64,
          filename: result.filename,
          contentType: result.contentType,
        });
        setWarnings(result.warnings);
      } catch {
        if (!cancelled) {
          setError("generate_failed");
          setPreview(null);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, currentId, projectId]);

  function closeViewer() {
    setPreview(null);
    setActiveId(null);
    setError(null);
    setWarnings([]);
    onOpenChange(false);
  }

  const errorMessage = error
    ? error.startsWith("Enter") ||
      error.startsWith("Could") ||
      error.includes(":")
      ? error
      : t("errors.previewFailed")
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
          <DialogTitle className="text-left">{t("viewTitle")}</DialogTitle>
          <DialogDescription className="text-left">
            {current ? (
              <>
                <span className="font-medium text-brand">{current.title}</span>
                <span className="text-muted-foreground">{` · ${current.subtitle}`}</span>
                {preview ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {preview.filename}
                  </span>
                ) : null}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{t("viewDraftHint")}</p>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-canvas">
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
            <PdfReader
              key={currentId ?? preview.filename}
              dataBase64={preview.base64}
            />
          ) : null}
          {pending && preview ? (
            <div className="absolute inset-0 flex items-center justify-center bg-canvas/70">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>

        {warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-warning-text">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {items.length > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={index <= 0 || pending}
                onClick={() => setActiveId(items[index - 1]?.id ?? null)}
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
                onClick={() => setActiveId(items[index + 1]?.id ?? null)}
                aria-label={t("viewerNext")}
                title={t("viewerNext")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
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
