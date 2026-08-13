"use client";

import { useLocale, useTranslations } from "next-intl";

import { switchOrganizationAction } from "@/app/actions/org";
import type { OrgRole } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils";

export type OrgSwitcherOption = {
  id: string;
  name: string;
  role: OrgRole;
};

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
  variant = "sidebar",
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  variant?: "sidebar" | "header";
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const active =
    organizations.find((org) => org.id === activeOrganizationId) ??
    organizations[0];

  if (!active) return null;

  if (organizations.length < 2) {
    return (
      <p
        className={cn(
          "truncate",
          variant === "sidebar" && "text-xs text-sidebar-foreground/55",
          variant === "header" && "text-sm font-medium text-brand",
        )}
      >
        {active.name}
      </p>
    );
  }

  const sorted = [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <form action={switchOrganizationAction}>
      <input type="hidden" name="locale" value={locale} />
      <label className="block min-w-0">
        <span className="sr-only">{t("switchOrgAria")}</span>
        <select
          name="organizationId"
          defaultValue={active.id}
          aria-label={t("switchOrgAria")}
          onChange={(event) => {
            if (event.target.value === active.id) return;
            event.currentTarget.form?.requestSubmit();
          }}
          className={cn(
            "h-9 w-full min-w-0 truncate rounded-xl border px-2.5 text-sm font-medium outline-none focus-visible:ring-3",
            variant === "sidebar" &&
              "h-8 border-sidebar-border bg-sidebar-accent px-2 text-xs text-sidebar-foreground focus-visible:border-sidebar-ring focus-visible:ring-sidebar-ring/30",
            variant === "header" &&
              "border-border bg-surface text-brand focus-visible:border-ring focus-visible:ring-ring/30",
          )}
        >
          {sorted.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
