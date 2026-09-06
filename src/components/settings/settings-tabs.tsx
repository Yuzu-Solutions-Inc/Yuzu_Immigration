"use client";

import { useTranslations } from "next-intl";

import type { ModuleId } from "@/lib/modules/catalog";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({
  canAdminister,
  enabledModules,
}: {
  canAdminister: boolean;
  enabledModules: readonly ModuleId[];
}) {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const immigrationOn = enabledModules.includes("immigration");

  const tabs = [
    { href: "/settings/account", label: t("account") },
    ...(canAdminister
      ? [
          { href: "/settings/organization", label: t("workspace") },
          { href: "/settings/billing", label: t("teamBilling") },
          { href: "/settings/payments", label: t("payments") },
        ]
      : []),
    ...(immigrationOn ? [{ href: "/settings/forms", label: t("forms") }] : []),
    ...(canAdminister
      ? [{ href: "/settings/security", label: t("compliance") }]
      : []),
  ];

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
