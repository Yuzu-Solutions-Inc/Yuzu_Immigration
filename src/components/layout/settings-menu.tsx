"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Sidebar link to account settings. */
export function SettingsNavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");

  return (
    <Link
      href="/settings/account"
      onClick={onNavigate}
      aria-label={t("menuAria")}
      title={collapsed ? t("menuLabel") : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Settings className="size-4 shrink-0 opacity-90" aria-hidden />
      <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
        {t("menuLabel")}
      </span>
    </Link>
  );
}

/** Compact icon control that opens account settings (header / overflow use). */
export function SettingsMenu({
  variant = "default",
  onNavigate,
}: {
  variant?: "default" | "sidebar";
  onNavigate?: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <Link
      href="/settings/account"
      onClick={onNavigate}
      aria-label={t("menuAria")}
      className={cn(
        variant === "default" &&
          "inline-flex size-8 items-center justify-center rounded-xl border border-border bg-surface text-brand transition-colors hover:bg-muted",
        variant === "sidebar" &&
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80",
      )}
    >
      <Settings className="size-4" />
    </Link>
  );
}
