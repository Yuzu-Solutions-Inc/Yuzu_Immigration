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

function orgNameShort(name: string) {
  return name.trim().slice(0, 2);
}

export function OrgSwitcher({
  organizations,
  activeOrganizationId,
  variant = "sidebar",
  collapsed = false,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  variant?: "sidebar" | "header";
  collapsed?: boolean;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const active =
    organizations.find((org) => org.id === activeOrganizationId) ??
    organizations[0];

  if (!active) return null;

  const label = collapsed ? orgNameShort(active.name) : active.name;

  if (organizations.length < 2) {
    return (
      <p
        title={collapsed ? active.name : undefined}
        className={cn(
          variant === "sidebar" && "text-xs text-sidebar-foreground/55",
          variant === "header" && "text-sm font-medium text-brand",
          collapsed
            ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-[11px] font-semibold tracking-wide text-sidebar-foreground"
            : "truncate",
        )}
      >
        {label}
      </p>
    );
  }

  const sorted = [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  return (
    <form
      action={switchOrganizationAction}
      className={cn(collapsed && "flex justify-center")}
    >
      <input type="hidden" name="locale" value={locale} />
      <label
        className={cn(
          "block min-w-0",
          collapsed && "relative size-9 shrink-0",
        )}
        title={collapsed ? active.name : undefined}
      >
        <span className="sr-only">{t("switchOrgAria")}</span>
        {collapsed ? (
          <span
            aria-hidden
            className="pointer-events-none flex size-9 items-center justify-center rounded-lg bg-sidebar-accent text-[11px] font-semibold tracking-wide text-sidebar-foreground"
          >
            {label}
          </span>
        ) : null}
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
            collapsed &&
              "absolute inset-0 cursor-pointer opacity-0",
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
