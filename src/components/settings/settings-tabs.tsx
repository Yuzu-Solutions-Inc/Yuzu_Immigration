"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ canAdminister }: { canAdminister: boolean }) {
  const t = useTranslations("settings");
  const pathname = usePathname();

  const tabs = [
    { href: "/settings/account", label: t("account") },
    { href: "/settings/calendar", label: t("calendar") },
    { href: "/settings/forms", label: t("forms") },
    ...(canAdminister
      ? [
          { href: "/settings/organization", label: t("organization") },
          { href: "/settings/billing", label: t("teamBilling") },
          { href: "/settings/payments", label: t("payments") },
          { href: "/settings/security", label: t("security") },
        ]
      : []),
  ] as const;

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
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
