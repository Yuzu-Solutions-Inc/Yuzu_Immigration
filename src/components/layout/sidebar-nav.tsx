"use client";

import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { signOutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import {
  OrgSwitcher,
  type OrgSwitcherOption,
} from "@/components/layout/org-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
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
const collapsedItemClass =
  "flex size-9 shrink-0 items-center justify-center rounded-lg";

const navItems = [
  { href: "/home", key: "home" as const, icon: Home },
  { href: "/projects", key: "projects" as const, icon: FolderKanban },
  { href: "/clients", key: "people" as const, icon: Users },
  { href: "/calendar", key: "calendar" as const, icon: CalendarDays },
  { href: "/bookings", key: "bookings" as const, icon: ClipboardList },
  { href: "/services", key: "services" as const, icon: Briefcase },
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

function SidebarCreateLink({
  href,
  label,
  collapsed,
  onNavigate,
  icon: Icon,
}: {
  href: "/projects/new" | "/clients/new";
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
  icon: typeof Plus;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cn(
        collapsed
          ? collapsedItemClass
          : cn(buttonVariants({ size: "sm" }), "w-full"),
        "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90",
      )}
    >
      {collapsed ? <Icon className="size-4" aria-hidden /> : label}
    </Link>
  );
}

function SidebarBody({
  organizations,
  activeOrganizationId,
  newProjectLabel,
  newPersonLabel,
  canCreate,
  collapsed = false,
  onNavigate,
  onToggleCollapse,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  newPersonLabel: string;
  canCreate: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const t = useTranslations("nav");
  const auth = useTranslations("auth");
  const pathname = usePathname();
  const locale = useLocale();

  const collapseLabel = collapsed ? t("expand") : t("collapse");

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "space-y-3 border-b border-sidebar-border",
          collapsed ? "flex flex-col items-center px-2 py-3" : "px-3 py-3",
        )}
      >
        <div
          className={cn(
            "flex",
            collapsed
              ? "flex-col items-center gap-1"
              : "h-9 items-center justify-between gap-2",
          )}
        >
          <BrandLogo
            href="/home"
            inverted
            markOnly={collapsed}
            size="sidebar"
          />
          {onToggleCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              aria-label={collapseLabel}
              title={collapseLabel}
              className={cn(
                "size-8 shrink-0 rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed && "size-9",
              )}
            >
              {collapsed ? (
                <PanelLeft className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
        <OrgSwitcher
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          variant="sidebar"
          collapsed={collapsed}
        />
        {canCreate ? (
          <>
            <SidebarCreateLink
              href="/projects/new"
              label={newProjectLabel}
              collapsed={collapsed}
              onNavigate={onNavigate}
              icon={Plus}
            />
            <SidebarCreateLink
              href="/clients/new"
              label={newPersonLabel}
              collapsed={collapsed}
              onNavigate={onNavigate}
              icon={UserPlus}
            />
          </>
        ) : null}
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto py-4",
          collapsed ? "items-center px-2" : "px-3",
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
                collapsed && cn(collapsedItemClass, "gap-0 px-0 py-0"),
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
          collapsed ? "flex flex-col items-center p-2" : "p-3",
        )}
      >
        <LegalLinks
          onNavigate={onNavigate}
          className={cn(
            collapsed
              ? "flex-col items-center gap-0"
              : undefined,
          )}
          linkClassName={cn(
            "block text-sidebar-foreground/45 hover:text-sidebar-foreground/70",
            collapsed
              ? "w-9 truncate px-0 py-1 text-center text-[11px]"
              : "px-3 py-1",
          )}
        />
        <LocaleSwitcher
          className={cn(collapsed ? "w-9" : "w-full px-0.5")}
          variant="sidebar"
          compact={collapsed}
        />
        <form
          action={signOutAction}
          className={cn(collapsed && "flex justify-center")}
        >
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            title={collapsed ? auth("signOut") : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && cn(collapsedItemClass, "w-9 gap-0 px-0 py-0"),
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
  newPersonLabel,
  canCreate,
  defaultCollapsed = false,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  newPersonLabel: string;
  canCreate: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh max-h-dvh shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarBody
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        newProjectLabel={newProjectLabel}
        newPersonLabel={newPersonLabel}
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
  newPersonLabel,
  canCreate,
}: {
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  newProjectLabel: string;
  newPersonLabel: string;
  canCreate: boolean;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden",
        )}
        aria-label={t("menu")}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(18rem,100%)] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        showCloseButton
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>
        <SidebarBody
          organizations={organizations}
          activeOrganizationId={activeOrganizationId}
          newProjectLabel={newProjectLabel}
          newPersonLabel={newPersonLabel}
          canCreate={canCreate}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
