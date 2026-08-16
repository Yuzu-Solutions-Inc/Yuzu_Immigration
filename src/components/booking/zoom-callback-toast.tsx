"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const ZOOM_ERROR_KEYS: Record<string, string> = {
  denied: "errors.zoom_denied",
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  no_refresh: "errors.zoom_no_refresh",
  callback_failed: "errors.zoom_callback_failed",
  save_failed: "errors.save_failed",
  not_configured: "errors.zoom_not_configured",
};

export function ZoomCallbackToast({ status }: { status?: string }) {
  const t = useTranslations("calendar");

  useEffect(() => {
    if (!status) return;
    if (status === "connected") {
      toast.success(t("zoomConnected"));
    } else {
      const key = ZOOM_ERROR_KEYS[status];
      toast.error(key ? t(key) : t("errors.generic"));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("zoom");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [status, t]);

  return null;
}
