"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { logoutPortalAction } from "@/app/actions/portal-auth";
import { portalAuthInitialState } from "@/app/actions/portal-state";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function PortalTopBar({
  organizationName,
  personName,
  showSignOut = false,
}: {
  organizationName?: string;
  personName?: string;
  showSignOut?: boolean;
}) {
  const t = useTranslations("auth");
  const tp = useTranslations("portal");
  const locale = useLocale();
  const [, logoutAction, logoutPending] = useActionState(
    logoutPortalAction,
    portalAuthInitialState,
  );

  const org = organizationName?.trim() ?? "";
  const person = personName?.trim() ?? "";

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4 sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BrandLogo href={showSignOut ? "/portal/home" : null} size="sm" inverted className="shrink-0" />
          {org || person ? (
            <div className="min-w-0">
              {org ? (
                <p className="truncate text-sm font-semibold text-sidebar-foreground">
                  {org}
                </p>
              ) : null}
              {person ? (
                <p className="truncate text-xs text-sidebar-foreground/70">
                  {person}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {showSignOut ? (
            <Link
              href="/portal/home"
              className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground sm:inline"
            >
              {tp("home")}
            </Link>
          ) : null}
          <LocaleSwitcher
            variant="sidebar"
            compact
            className="w-[4.25rem] shrink-0"
          />
          {showSignOut ? (
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                disabled={logoutPending}
                aria-busy={logoutPending}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent px-2.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/80 disabled:opacity-60 sm:px-3 sm:text-sm",
                )}
              >
                <LogOut className="size-3.5 shrink-0" aria-hidden />
                <span className="hidden sm:inline">{t("signOut")}</span>
                <span className="sr-only sm:hidden">{t("signOut")}</span>
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
