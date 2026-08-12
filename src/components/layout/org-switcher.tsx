"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { switchOrganizationAction } from "@/app/actions/org";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const tRoles = useTranslations("orgRoles");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
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
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={t("switchOrgAria")}
        className={cn(
          "flex w-full min-w-0 items-center gap-1 rounded-lg text-left outline-none focus-visible:ring-2",
          variant === "sidebar" &&
            "px-1 py-0.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/40",
          variant === "header" &&
            "px-1.5 py-1 text-sm font-medium text-brand hover:bg-muted focus-visible:ring-ring/40",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{active.name}</span>
        <ChevronsUpDown
          className={cn(
            "size-3.5 shrink-0 opacity-70",
            variant === "header" && "size-4",
          )}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="min-w-56"
      >
        <DropdownMenuLabel>{t("switchOrg")}</DropdownMenuLabel>
        {sorted.map((org) => {
          const isActive = org.id === active.id;
          return (
            <DropdownMenuItem
              key={org.id}
              disabled={pending}
              className="items-start"
              onClick={() => {
                if (isActive) return;
                const formData = new FormData();
                formData.set("locale", locale);
                formData.set("organizationId", org.id);
                startTransition(() => {
                  void switchOrganizationAction(formData);
                });
              }}
            >
              <Check
                className={cn(
                  "mt-0.5 size-4",
                  isActive ? "opacity-100" : "opacity-0",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {tRoles(org.role)}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
