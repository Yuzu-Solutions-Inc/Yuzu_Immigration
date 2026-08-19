"use client";

import { Bell, ChevronRight, CircleHelp, FolderKanban, Search, Settings, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
  searchWorkspaceAction,
  type WorkspaceSearchHit,
} from "@/app/actions/workspace-search";
import type { StaffNotificationRow } from "@/lib/notifications/queries";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORT_EMAIL = "support@yuzu.solutions";

type Crumb = { label: string; href?: string };

const CRUMB_KEYS = {
  home: "crumbHome",
  projects: "crumbProjects",
  people: "crumbPeople",
  clients: "crumbPeople",
  calendar: "crumbCalendar",
  bookings: "crumbBookings",
  services: "crumbServices",
  settings: "crumbSettings",
  account: "crumbAccount",
  organization: "crumbOrganization",
  security: "crumbSecurity",
  forms: "crumbForms",
  new: "crumbNew",
  edit: "crumbEdit",
  templates: "crumbTemplates",
  person: "crumbPerson",
  project: "crumbProject",
  review: "crumbReview",
  detail: "crumbDetail",
} as const;

function useBreadcrumbs(t: ReturnType<typeof useTranslations<"topBar">>): Crumb[] {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ label: t("crumbHome"), href: "/home" }];
  }

  const crumbs: Crumb[] = [];
  let acc = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    acc += `/${seg}`;
    const isLast = i === segments.length - 1;

    if (UUID_RE.test(seg)) {
      const parent = segments[i - 1];
      const label =
        parent === "clients" || parent === "people"
          ? t("crumbPerson")
          : parent === "projects" || parent === "templates"
            ? t("crumbProject")
            : t("crumbDetail");
      crumbs.push({
        label,
        href: isLast ? undefined : (acc as "/home"),
      });
      continue;
    }

    const key = CRUMB_KEYS[seg as keyof typeof CRUMB_KEYS];
    const label = key ? t(key) : seg.replace(/-/g, " ");
    crumbs.push({
      label,
      href: isLast ? undefined : (acc as "/home"),
    });
  }

  return crumbs;
}

function AppBreadcrumbs() {
  const t = useTranslations("topBar");
  const crumbs = useBreadcrumbs(t);

  return (
    <nav aria-label={t("breadcrumbsAria")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-sidebar-foreground/70">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? (
              <ChevronRight
                className="size-3 shrink-0 text-sidebar-foreground/40"
                aria-hidden
              />
            ) : null}
            {crumb.href ? (
              <Link
                href={crumb.href as "/home"}
                className="truncate transition-colors hover:text-sidebar-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-sidebar-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function AppSearch() {
  const t = useTranslations("topBar");
  const router = useRouter();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<WorkspaceSearchHit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const next = await searchWorkspaceAction(q);
        setHits(next);
        setOpen(true);
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function go(hit: WorkspaceSearchHit) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(hit.href as "/projects");
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <label htmlFor={inputId} className="sr-only">
        {t("searchLabel")}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/45"
          aria-hidden
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          className="h-8 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/80 pr-8 pl-8 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none focus-visible:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring/30"
        />
        {query ? (
          <button
            type="button"
            className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-sidebar-foreground/50 hover:text-sidebar-foreground"
            aria-label={t("searchClear")}
            onClick={() => {
              setQuery("");
              setHits([]);
              setOpen(false);
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <div
          role="listbox"
          aria-label={t("searchResults")}
          className="absolute top-[calc(100%+0.35rem)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {pending && hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {t("searchLoading")}
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {t("searchEmpty")}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {hits.map((hit) => {
                const Icon = hit.type === "project" ? FolderKanban : User;
                return (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      onClick={() => go(hit)}
                    >
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {hit.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {hit.type === "project"
                            ? t("searchProject")
                            : t("searchPerson")}
                          {hit.subtitle ? ` · ${hit.subtitle}` : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function notificationBody(
  row: StaffNotificationRow,
  t: ReturnType<typeof useTranslations<"topBar">>,
): string {
  if (row.kind === "documents_uploaded") {
    const count =
      typeof row.metadata.fileCount === "number" ? row.metadata.fileCount : 1;
    return t("notifyNewFiles", { count });
  }
  if (row.kind === "forms_complete") {
    return t("notifyFormsComplete");
  }
  if (row.kind === "form_certification") {
    const count =
      typeof row.metadata.count === "number" ? row.metadata.count : 1;
    return t("notifyFormCert", { count });
  }
  return row.body ?? "";
}

function AppNotifications() {
  const t = useTranslations("topBar");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<StaffNotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const next = await getNotificationsAction();
      setItems(next);
    });
  }

  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "visible") refresh();
    }
    refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus-only refresh
  }, []);

  const unread = items.filter((row) => !row.read_at);
  const unreadCount = unread.length;

  async function openItem(row: StaffNotificationRow) {
    if (!row.read_at) {
      await markNotificationsReadAction([row.id]);
      setItems((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    }
    setOpen(false);
    if (row.href) {
      router.push(row.href as "/home");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative inline-flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label={t("notificationsAria", { count: unreadCount })}
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-action text-[10px] font-semibold text-action-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">
            {t("notificationsTitle")}
          </p>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-action hover:underline"
              onClick={() => {
                startTransition(async () => {
                  await markAllNotificationsReadAction();
                  setItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      read_at: item.read_at ?? new Date().toISOString(),
                    })),
                  );
                });
              }}
            >
              {t("markAllRead")}
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("notificationsEmpty")}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-muted",
                    !row.read_at && "bg-action/5",
                  )}
                  onClick={() => void openItem(row)}
                >
                  <span className="text-sm font-medium text-foreground">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {notificationBody(row, t)}
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(row.created_at))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSupportMenu() {
  const t = useTranslations("topBar");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label={t("supportAria")}
      >
        <CircleHelp className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("supportHelpSubject"))}`;
          }}
        >
          {t("supportHelp")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t("supportFormSubject"))}`;
          }}
        >
          {t("supportForm")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSettingsLink() {
  const t = useTranslations("settings");

  return (
    <Link
      href="/settings/account"
      aria-label={t("menuAria")}
      className="inline-flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <Settings className="size-4" aria-hidden />
    </Link>
  );
}

export function AppTopBar({
  mobileTrigger,
}: {
  mobileTrigger: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {mobileTrigger}
        <div className="hidden min-w-0 sm:block">
          <AppBreadcrumbs />
        </div>
      </div>

      <div className="flex min-w-0 max-w-[11rem] flex-1 justify-center sm:max-w-xs md:max-w-md md:flex-1">
        <AppSearch />
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1">
        <AppNotifications />
        <AppSupportMenu />
        <AppSettingsLink />
      </div>
    </header>
  );
}
