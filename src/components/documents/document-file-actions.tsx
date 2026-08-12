"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  base64ToBlob,
  isBrowserPreviewable,
  triggerBrowserDownload,
  type DocumentFilePayload,
} from "@/lib/documents/browser-file";

type FetchResult =
  | { ok: true; base64: string; filename: string; contentType: string }
  | { ok: false; error: string };

export function DocumentFileActions({
  requestId,
  filename,
  fetchFile,
  compact = false,
}: {
  requestId: string;
  filename: string;
  fetchFile: (requestId: string) => Promise<FetchResult>;
  /** Icon-only buttons for denser staff lists */
  compact?: boolean;
}) {
  const t = useTranslations("documents");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(DocumentFilePayload & { url: string }) | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function run(mode: "preview" | "download") {
    setError(null);
    setBusy(mode);
    startTransition(async () => {
      try {
        const result = await fetchFile(requestId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const payload: DocumentFilePayload = {
          base64: result.base64,
          filename: result.filename,
          contentType: result.contentType,
        };
        if (mode === "download") {
          triggerBrowserDownload(payload);
          return;
        }
        if (!isBrowserPreviewable(payload.contentType)) {
          setError("preview_unsupported");
          return;
        }
        const blob = base64ToBlob(payload.base64, payload.contentType);
        const url = URL.createObjectURL(blob);
        setPreview({ ...payload, url });
      } finally {
        setBusy(null);
      }
    });
  }

  const loading = pending && busy !== null;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          disabled={loading}
          onClick={() => run("preview")}
          aria-label={t("preview")}
        >
          {busy === "preview" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Eye className="size-4" />
          )}
          {compact ? null : <span className="ml-1.5">{t("preview")}</span>}
        </Button>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          disabled={loading}
          onClick={() => run("download")}
          aria-label={t("download")}
        >
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {compact ? null : <span className="ml-1.5">{t("download")}</span>}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error === "preview_unsupported"
            ? t("errors.previewUnsupported")
            : t("errors.downloadFailed")}
        </p>
      ) : null}

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] flex-col gap-3 sm:max-w-[min(96vw,56rem)]"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>{t("previewTitle")}</DialogTitle>
            <DialogDescription>
              {preview?.filename ?? filename}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-canvas">
              {preview.contentType === "application/pdf" ? (
                <iframe
                  title={preview.filename}
                  src={preview.url}
                  className="h-[min(70vh,40rem)] w-full"
                />
              ) : (
                // Object URL blob — not a static asset for next/image
                <img
                  src={preview.url}
                  alt={preview.filename}
                  className="mx-auto max-h-[min(70vh,40rem)] w-auto max-w-full object-contain p-2"
                />
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (preview) triggerBrowserDownload(preview);
              }}
            >
              <Download className="size-4" />
              <span className="ml-1.5">{t("download")}</span>
            </Button>
            <Button type="button" onClick={closePreview}>
              {t("closePreview")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
