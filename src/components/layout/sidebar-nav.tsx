"use client";

import { FolderKanban, Home, LogOut, Menu, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { signOutAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
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

function SidebarBody({
  orgName,
  newProjectLabel,
  onNavigate,
}: {
  orgName: string;
  newProjectLabel: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const auth = useTranslations("auth");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b border-sidebar-border px-4 py-5">
        <BrandLogo href="/home" size="sm" inverted />
        <p className="truncate text-xs text-sidebar-foreground/55">{orgName}</p>
        <Link
          href="/projects/new"
          onClick={onNavigate}
          className={cn(
            buttonVariants({ size: "sm" }),
            "w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90",
          )}
        >
          {newProjectLabel}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-3">
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
            {auth("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

export function DesktopSidebar({
  orgName,
  newProjectLabel,
}: {
  orgName: string;
  newProjectLabel: string;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
      <SidebarBody orgName={orgName} newProjectLabel={newProjectLabel} />
    </aside>
  );
}

export function MobileSidebarTrigger({
  orgName,
  newProjectLabel,
}: {
  orgName: string;
  newProjectLabel: string;
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
          orgName={orgName}
          newProjectLabel={newProjectLabel}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
