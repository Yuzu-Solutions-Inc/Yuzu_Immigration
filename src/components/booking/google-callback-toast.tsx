"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function GoogleCallbackToast({
  status,
}: {
  status?: string;
}) {
  const t = useTranslations("calendar");

  useEffect(() => {
    if (!status) return;
    if (status === "connected") {
      toast.success(t("googleConnected"));
    }
    else if (
      status === "denied" ||
      status === "unauthorized" ||
      status === "forbidden" ||
      status === "no_refresh" ||
      status === "callback_failed" ||
      status === "save_failed" ||
      status === "not_configured"
    ) {
      toast.error(t(`errors.${status}`));
    } else {
      toast.error(t("errors.generic"));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [status, t]);

  return null;
}
