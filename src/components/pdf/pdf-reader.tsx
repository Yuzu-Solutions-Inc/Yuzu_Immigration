"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { Button } from "@/components/ui/button";
import { base64ToBytes } from "@/lib/documents/browser-file";
import { cn } from "@/lib/utils";

import "./xfa-layer.css";

const PDFJS_BASE = "/pdfjs/";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;
const PAGE_GUTTER = 16;

const linkService = {
  addLinkAttributes(
    link: HTMLAnchorElement,
    url: string,
    newWindow?: boolean,
  ) {
    if (!url) return;
    link.href = url;
    link.rel = "noopener noreferrer nofollow";
    link.target = newWindow === false ? "_self" : "_blank";
  },
};

let workerReady = false;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
    workerReady = true;
  }
  return pdfjs;
}

export function PdfReader({
  dataBase64,
  className,
}: {
  dataBase64: string;
  className?: string;
}) {
  const t = useTranslations("pdfReader");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setCurrentPage(1);
    setPageCount(0);
    setUserZoom(1);
    pagesRef.current?.replaceChildren();

    async function open() {
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({
        data: base64ToBytes(dataBase64).slice(),
        password: "",
        enableXfa: true,
        disableStream: true,
        disableRange: true,
        disableAutoFetch: true,
        cMapUrl: `${PDFJS_BASE}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
        wasmUrl: `${PDFJS_BASE}wasm/`,
        iccUrl: `${PDFJS_BASE}iccs/`,
      });
      const pdf = await task.promise;
      if (cancelled) {
        await pdf.cleanup();
        await pdf.loadingTask.destroy();
        return;
      }
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
      setStatus("ready");
    }

    void open().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      const pdf = pdfRef.current;
      pdfRef.current = null;
      if (!pdf) return;
      void pdf.cleanup().then(() => pdf.loadingTask.destroy());
    };
  }, [dataBase64]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const host = pagesRef.current;
    if (status !== "ready" || !pdf || !host || width < 40) return;

    let cancelled = false;
    const pageEls: HTMLElement[] = [];

    async function draw() {
      if (!pdf || !host) return;
      setDrawing(true);
      const pdfjs = await loadPdfjs();
      if (cancelled) return;
      host.replaceChildren();

      const first = await pdf.getPage(1);
      if (cancelled) return;
      const base = first.getViewport({ scale: 1 });
      const fit = (width - PAGE_GUTTER) / base.width;
      const scale = Math.max(0.1, fit * userZoom);

      for (let n = 1; n <= pdf.numPages; n++) {
        const page = n === 1 ? first : await pdf.getPage(n);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const pageEl = document.createElement("div");
        pageEl.className = "yuzu-pdf-page";
        pageEl.dataset.page = String(n);
        pageEl.style.width = `${Math.floor(viewport.width)}px`;
        pageEl.style.height = `${Math.floor(viewport.height)}px`;
        pageEl.setAttribute("aria-label", t("pageOf", { current: n, total: pdf.numPages }));

        if (!page.isPureXfa) {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (context) {
            const outputScale = new pdfjs.OutputScale();
            canvas.width = Math.floor(viewport.width * outputScale.sx);
            canvas.height = Math.floor(viewport.height * outputScale.sy);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            pageEl.append(canvas);
            try {
              const renderTask = page.render({
                canvas,
                canvasContext: context,
                viewport,
                ...(outputScale.scaled
                  ? {
                      transform: [
                        outputScale.sx,
                        0,
                        0,
                        outputScale.sy,
                        0,
                        0,
                      ],
                    }
                  : {}),
              });
              await renderTask.promise;
            } catch {
              // Certified / encrypted XFA forms often have no usable page stream.
            }
          }
        }

        try {
          const xfaHtml = await page.getXfa();
          if (xfaHtml) {
            const xfaDiv = document.createElement("div");
            pageEl.append(xfaDiv);
            pdfjs.XfaLayer.render({
              viewport: viewport.clone({ dontFlip: true }),
              div: xfaDiv,
              xfaHtml,
              annotationStorage: pdf.annotationStorage,
              linkService: linkService as never,
              intent: "display",
            });
          }
        } catch {
          // Canvas-only PDFs still display.
        }

        if (cancelled) return;
        host.append(pageEl);
        pageEls.push(pageEl);
      }

      if (cancelled) return;
      const scroll = scrollRef.current;
      if (!scroll || pageEls.length === 0) return;
      const io = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          const page = Number(
            (visible?.target as HTMLElement | undefined)?.dataset.page,
          );
          if (page) setCurrentPage(page);
        },
        { root: scroll, threshold: [0.35, 0.6] },
      );
      for (const el of pageEls) io.observe(el);
      if (cancelled) {
        io.disconnect();
        return;
      }
      cleanupObserver = () => io.disconnect();
    }

    let cleanupObserver = () => {};
    void draw()
      .catch(() => {
        if (!cancelled) setStatus("error");
      })
      .finally(() => {
        if (!cancelled) setDrawing(false);
      });

    return () => {
      cancelled = true;
      cleanupObserver();
    };
  }, [status, width, userZoom, dataBase64, t]);

  const zoomOut = () =>
    setUserZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomIn = () =>
    setUserZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));

  return (
    <div
      className={cn(
        "yuzu-pdf-reader flex h-[min(70vh,40rem)] min-h-0 flex-col bg-canvas",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={zoomOut}
          disabled={status !== "ready" || userZoom <= MIN_ZOOM}
          aria-label={t("zoomOut")}
          title={t("zoomOut")}
        >
          <Minus className="size-4" />
        </Button>
        <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(userZoom * 100)}%
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={zoomIn}
          disabled={status !== "ready" || userZoom >= MAX_ZOOM}
          aria-label={t("zoomIn")}
          title={t("zoomIn")}
        >
          <Plus className="size-4" />
        </Button>
        {pageCount > 0 ? (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {t("pageOf", { current: currentPage, total: pageCount })}
          </span>
        ) : null}
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-2">
        {status === "loading" || drawing ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas/80">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <span>{t("loading")}</span>
            </div>
          </div>
        ) : null}
        {status === "error" ? (
          <p className="p-6 text-sm text-destructive" role="alert">
            {t("error")}
          </p>
        ) : null}
        <div
          ref={pagesRef}
          className={status === "ready" ? "flex flex-col items-center" : "hidden"}
        />
      </div>
    </div>
  );
}
