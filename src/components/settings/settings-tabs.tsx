"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ canAdminister }: { canAdminister: boolean }) {
  const t = useTranslations("settings");
  const pathname = usePathname();

  const tabs = [
    { href: "/settings/account", label: t("account") },
    ...(canAdminister
      ? [
          { href: "/settings/organization", label: t("organization") },
          { href: "/settings/security", label: t("security") },
        ]
      : []),
  ] as const;

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-action text-brand"
                : "border-transparent text-muted-foreground hover:text-brand",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
