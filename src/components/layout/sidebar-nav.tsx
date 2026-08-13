"use client";

import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  Plus,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { signOutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import {
  OrgSwitcher,
  type OrgSwitcherOption,
} from "@/components/layout/org-switcher";
import { SettingsNavLinks } from "@/components/layout/settings-menu";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_COOKIE = "sidebar-collapsed";

const navItems = [
  { href: "/home", key: "home" as const, icon: Home },
  { href: "/projects", key: "projects" as const, icon: FolderKanban },
  { href: "/people", key: "people" as const, icon: Users },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/home") {
    return pathname === "/home";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function persistSidebarCollapsed(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function SidebarBody({
  organizations,
  activeOrganizationId,
  newProjectLabel,
  canCreate,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  canCreate: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const t = useTranslations("nav");
  const auth = useTranslations("auth");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="relative flex h-full flex-col">
      {onToggleCollapse && !collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded
          aria-label={t("collapse")}
          title={t("collapse")}
          className="absolute top-1.5 right-1.5 z-10 inline-flex size-7 items-center justify-center rounded-md text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      ) : null}
      <div
        className={cn(
          "space-y-4 border-b border-sidebar-border py-5",
          collapsed ? "px-2" : "px-4 pr-10",
        )}
      >
        {collapsed ? (
          onToggleCollapse ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-expanded={false}
                aria-label={t("expand")}
                title={t("expand")}
                className="inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>
          ) : null
        ) : (
          <BrandLogo href="/home" size="sm" inverted />
        )}
        <OrgSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          variant="sidebar"
          collapsed={collapsed}
        />
        {canCreate ? (
          <Link
            href="/projects/new"
            onClick={onNavigate}
            aria-label={newProjectLabel}
            title={collapsed ? newProjectLabel : undefined}
            className={cn(
              buttonVariants({ size: collapsed ? "icon-sm" : "sm" }),
              "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90",
              collapsed ? "mx-auto" : "w-full",
            )}
          >
            {collapsed ? (
              <Plus className="size-4" aria-hidden />
            ) : (
              newProjectLabel
            )}
          </Link>
        ) : null}
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const label = t(item.key);
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-label={label}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
              <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "mt-auto space-y-2 border-t border-sidebar-border",
          collapsed ? "p-2" : "p-3",
        )}
      >
        <PrivacyLink
          onNavigate={onNavigate}
          className={cn(
            "block text-sidebar-foreground/45 hover:text-sidebar-foreground/70",
            collapsed
              ? "truncate px-0 py-1 text-center text-[11px]"
              : "px-3 py-1",
          )}
        />
        <LocaleSwitcher
          className={cn("w-full", !collapsed && "px-0.5")}
          variant="sidebar"
          compact={collapsed}
        />
        <SettingsNavLinks onNavigate={onNavigate} collapsed={collapsed} />
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            title={collapsed ? auth("signOut") : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
            <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
              {auth("signOut")}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

export function DesktopSidebar({
  organizations,
  activeOrganizationId,
  newProjectLabel,
  canCreate,
  defaultCollapsed = false,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  canCreate: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarBody
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        newProjectLabel={newProjectLabel}
        canCreate={canCreate}
        collapsed={collapsed}
        onToggleCollapse={() => {
          setCollapsed((prev) => {
            const next = !prev;
            persistSidebarCollapsed(next);
            return next;
          });
        }}
      />
    </aside>
  );
}

export function MobileSidebarTrigger({
  organizations,
  activeOrganizationId,
  newProjectLabel,
  canCreate,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  canCreate: boolean;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "lg:hidden",
        )}
        aria-label={t("menu")}
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        showCloseButton
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>
        <SidebarBody
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          newProjectLabel={newProjectLabel}
          canCreate={canCreate}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
