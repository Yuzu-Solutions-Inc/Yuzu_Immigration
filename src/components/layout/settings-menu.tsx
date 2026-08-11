"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("settings");
  const pathname = usePathname();

  const items = [
    { href: "/settings/account", label: t("account") },
    { href: "/settings/organization", label: t("organization") },
  ] as const;

  const settingsActive = pathname.startsWith("/settings");

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
          settingsActive
            ? "text-sidebar-primary-foreground"
            : "text-sidebar-foreground/75",
        )}
      >
        <Settings className="size-4 shrink-0 opacity-90" aria-hidden />
        <span>{t("menuLabel")}</span>
      </div>
      <div className="space-y-0.5 pl-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
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
