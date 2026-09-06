"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function TeamSettings() {
  const t = useTranslations("nav");
  return (
    <p className="text-sm text-muted-foreground">
      <Link href="/settings/team" className="text-brand underline-offset-4 hover:underline">
        {t("settings")}
      </Link>
    </p>
  );
}
