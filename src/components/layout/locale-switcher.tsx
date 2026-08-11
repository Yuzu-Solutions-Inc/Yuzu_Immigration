"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({
  className,
  compact = false,
  variant = "default",
}: {
  className?: string;
  compact?: boolean;
  variant?: "default" | "sidebar";
}) {
  const t = useTranslations("locale");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className={cn("inline-flex items-center gap-2", className)}>
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        aria-label={t("label")}
        onChange={(e) => {
          const next = e.target.value as AppLocale;
          router.replace(pathname, { locale: next });
        }}
        className={cn(
          "h-9 w-full rounded-xl border px-2.5 text-sm font-medium outline-none focus-visible:ring-3",
          variant === "default" &&
            "border-border bg-surface text-brand focus-visible:border-ring focus-visible:ring-ring/30",
          variant === "sidebar" &&
            "border-sidebar-border bg-sidebar-accent text-sidebar-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/30",
          compact && "h-8 px-2 text-xs",
        )}
      >
        {APP_LOCALES.map((code) => (
          <option key={code} value={code}>
            {compact ? code.toUpperCase() : LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
