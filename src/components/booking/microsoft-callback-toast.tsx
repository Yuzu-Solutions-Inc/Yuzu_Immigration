"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const MICROSOFT_ERROR_KEYS: Record<string, string> = {
  denied: "errors.microsoft_denied",
  unauthorized: "errors.unauthorized",
  forbidden: "errors.forbidden",
  no_refresh: "errors.microsoft_no_refresh",
  callback_failed: "errors.microsoft_callback_failed",
  save_failed: "errors.save_failed",
  not_configured: "errors.microsoft_not_configured",
};

export function MicrosoftCallbackToast({
  status,
}: {
  status?: string;
}) {
  const t = useTranslations("calendar");

  useEffect(() => {
    if (!status) return;
    if (status === "connected") {
      toast.success(t("microsoftConnected"));
    } else {
      const key = MICROSOFT_ERROR_KEYS[status];
      toast.error(key ? t(key) : t("errors.generic"));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("microsoft");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [status, t]);

  return null;
}
