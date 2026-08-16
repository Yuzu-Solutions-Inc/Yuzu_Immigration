"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { StatusPage } from "@/components/status/status-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function RouteError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: "/" | "/home";
}) {
  const t = useTranslations("statusPages");

  useEffect(() => {
    console.error("Route error:", error.digest ?? error.name);
  }, [error]);

  return (
    <StatusPage
      title={t("errorTitle")}
      body={t("errorBody")}
      compact={homeHref === "/home"}
      logoHref={homeHref}
      actions={
        <>
          <Button type="button" onClick={reset}>
            {t("errorRetry")}
          </Button>
          <Link
            href={homeHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("errorHome")}
          </Link>
        </>
      }
      footer={
        error.digest ? (
          <p className="text-xs text-muted-foreground">
            {t("errorReference", { digest: error.digest })}
          </p>
        ) : null
      }
    />
  );
}
