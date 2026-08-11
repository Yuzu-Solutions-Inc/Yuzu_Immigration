"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsMenu({
  variant = "default",
  onNavigate,
}: {
  variant?: "default" | "sidebar";
  onNavigate?: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          variant === "default" &&
            buttonVariants({ variant: "outline", size: "icon-sm" }),
          variant === "sidebar" &&
            "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/30",
        )}
        aria-label={t("menuAria")}
      >
        <Settings className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{t("menuLabel")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link
              href="/settings/account"
              className="cursor-pointer"
              onClick={onNavigate}
            />
          }
        >
          {t("account")}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link
              href="/settings/organization"
              className="cursor-pointer"
              onClick={onNavigate}
            />
          }
        >
          {t("organization")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
