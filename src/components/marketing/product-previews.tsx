import {
  Ban,
  Bell,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FolderKanban,
  Home,
  Link2,
  LogOut,
  Search,
  Settings,
  Settings2,
  Users,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { CaseloadBar } from "@/components/home/caseload-bar";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { ProductChrome } from "@/components/marketing/product-chrome";
import { SurfaceCard } from "@/components/layout/surface-card";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  formatDateInZone,
  formatDateTimeInZone,
  formatMonthYear,
  formatTimeInZone,
  monthGrid,
  weekStartsOn,
  zonedCivilToUtc,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "home" as const, icon: Home },
  { key: "projects" as const, icon: FolderKanban },
  { key: "people" as const, icon: Users },
  { key: "calendar" as const, icon: CalendarDays },
  { key: "bookings" as const, icon: ClipboardList },
  { key: "services" as const, icon: Briefcase },
] as const;

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const BOOKING_ZONE = "America/Toronto";
const BOOKING_YEAR = 2026;
const BOOKING_MONTH = 7;
const BOOKING_SELECTED = "2026-08-18";
const BOOKING_AVAILABLE = new Set([
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-21",
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-28",
]);
const BOOKING_SLOT_HOURS = ["09:00", "10:00", "11:00", "14:00", "14:30", "16:00"];
const CALENDAR_MARKERS: Record<string, number> = {
  "2026-08-17": 1,
  "2026-08-18": 2,
  "2026-08-19": 1,
  "2026-08-21": 1,
  "2026-08-25": 1,
  "2026-08-26": 1,
};
const CALENDAR_BLOCKED = new Set(["2026-08-20"]);
const CAL_TIMELINE_START = 9;
const CAL_TIMELINE_HOURS = 8;
const CAL_HOUR_PX = 36;

function previewHourLabel(hour: number, locale: string) {
  return formatTimeInZone(
    zonedCivilToUtc(
      BOOKING_SELECTED,
      `${String(hour).padStart(2, "0")}:00`,
      BOOKING_ZONE,
    ),
    BOOKING_ZONE,
    locale,
  );
}

function previewRangeStyle(startHour: number, endHour: number) {
  return {
    top: (startHour - CAL_TIMELINE_START) * CAL_HOUR_PX,
    height: Math.max(18, (endHour - startHour) * CAL_HOUR_PX),
  };
}

function PreviewSidebar({
  orgName,
  active,
  newProject,
  newPerson,
  signOut,
  navLabels,
}: {
  orgName: string;
  active: (typeof NAV)[number]["key"];
  newProject: string;
  newPerson: string;
  signOut: string;
  navLabels: Record<(typeof NAV)[number]["key"], string>;
}) {
  return (
    <aside className="flex w-[13.5rem] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="space-y-3 border-b border-sidebar-border px-3 py-4">
        <BrandLogo href={null} size="sm" inverted />
        <div className="truncate rounded-lg bg-sidebar-accent px-2.5 py-1.5 text-[12px] font-medium text-sidebar-accent-foreground">
          {orgName}
        </div>
        <div className="flex h-8 items-center justify-center rounded-xl bg-sidebar-primary text-[12px] font-semibold text-sidebar-primary-foreground">
          {newProject}
        </div>
        <div className="flex h-8 items-center justify-center rounded-xl bg-sidebar-primary text-[12px] font-semibold text-sidebar-primary-foreground">
          {newPerson}
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
              {navLabels[item.key]}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/75">
          <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
          {signOut}
        </div>
      </div>
    </aside>
  );
}

function PreviewTopBar({
  crumb,
  searchPlaceholder,
}: {
  crumb: string;
  searchPlaceholder: string;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
      <p className="min-w-0 truncate text-xs font-medium text-sidebar-foreground">
        {crumb}
      </p>
      <div className="relative mx-auto w-full max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/45"
          aria-hidden
        />
        <div className="h-8 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/80 pr-8 pl-8 text-sm leading-8 text-sidebar-foreground/40">
          {searchPlaceholder}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-sidebar-foreground/80">
        <span className="inline-flex size-8 items-center justify-center rounded-lg">
          <Bell className="size-4" aria-hidden />
        </span>
        <span className="inline-flex size-8 items-center justify-center rounded-lg">
          <CircleHelp className="size-4" aria-hidden />
        </span>
        <span className="inline-flex size-8 items-center justify-center rounded-lg">
          <Settings className="size-4" aria-hidden />
        </span>
      </div>
    </header>
  );
}

function PreviewKpi({
  label,
  value,
  hint,
  emphasize = false,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5",
        emphasize ? "bg-action/10" : "bg-muted/60",
        className,
      )}
    >
      <p
        className={cn(
          "font-heading text-2xl leading-none font-semibold tracking-tight tabular-nums",
          emphasize ? "text-action" : "text-brand",
        )}
      >
        {value}
      </p>
      <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {hint ? (
        <p
          className={cn(
            "truncate text-xs font-medium tabular-nums",
            emphasize ? "text-action" : "text-brand",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function AttentionRow({
  title,
  detail,
  meta,
  metaClass,
}: {
  title: string;
  detail?: string;
  meta: string;
  metaClass: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand">{title}</p>
        {detail ? (
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <p className={cn("shrink-0 text-xs font-semibold tabular-nums", metaClass)}>
        {meta}
      </p>
    </div>
  );
}

function TabChip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-lg px-3 py-1.5 text-sm font-medium",
        active
          ? "bg-action/10 font-semibold text-action"
          : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export async function AppHomePreview({
  fadeBottom = false,
  tone = "dark",
}: {
  fadeBottom?: boolean;
  tone?: "dark" | "light";
}) {
  const locale = await getLocale();
  const [t, tApp, tNav, tTop, tAuth] = await Promise.all([
    getTranslations("home"),
    getTranslations("appHome"),
    getTranslations("nav"),
    getTranslations("topBar"),
    getTranslations("auth"),
  ]);

  const dateLabel = new Date().toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { weekday: "short", month: "short", day: "numeric" },
  );

  return (
    <ProductChrome
      url={t("preview.urlHome")}
      fadeBottom={fadeBottom}
      tone={tone}
      innerHeight={640}
    >
      <PreviewSidebar
        orgName={t("preview.orgName")}
        active="home"
        newProject={tApp("newProject")}
        newPerson={tApp("newPerson")}
        signOut={tAuth("signOut")}
        navLabels={{
          home: tNav("home"),
          projects: tNav("projects"),
          people: tNav("people"),
          calendar: tNav("calendar"),
          bookings: tNav("bookings"),
          services: tNav("services"),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <PreviewTopBar
          crumb={tTop("crumbHome")}
          searchPlaceholder={tTop("searchPlaceholder")}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-heading text-lg font-semibold tracking-tight text-brand">
                {tApp("greetingAfternoon", { name: t("preview.userName") })}
              </h1>
              <p className="text-xs text-muted-foreground">{dateLabel}</p>
            </div>
            <span className="inline-flex h-9 items-center rounded-xl bg-action px-3 text-sm font-semibold text-action-foreground">
              {tApp("newProject")}
            </span>
          </div>

          <div className="grid shrink-0 grid-cols-12 gap-2">
            <div className="col-span-6 flex min-w-0 flex-col gap-2 rounded-xl bg-muted/60 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-heading text-2xl leading-none font-semibold tracking-tight text-brand tabular-nums">
                  15
                </p>
                <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {tApp("caseload.title")}
                </p>
              </div>
              <CaseloadBar
                open={8}
                ready={3}
                submitted={4}
                empty={tApp("caseload.empty")}
                labels={{
                  open: tApp("caseload.open"),
                  ready: tApp("caseload.ready"),
                  submitted: tApp("caseload.submitted"),
                }}
              />
            </div>
            <PreviewKpi
              className="col-span-3"
              label={tApp("tiles.docsToReview")}
              value={3}
              emphasize
            />
            <PreviewKpi
              className="col-span-3"
              label={tApp("tiles.unpaid")}
              value={1}
              hint={formatPriceCents(15000, locale, "CAD")}
              emphasize
            />
          </div>

          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-12 gap-4">
            <SurfaceCard className="col-span-5 flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-5">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="font-heading text-base font-semibold text-brand">
                    {tApp("attention.title")}
                  </h2>
                  <span className="tabular-nums text-sm font-semibold text-destructive">
                    4
                  </span>
                </div>
                <span className="text-xs font-medium text-action">
                  {tApp("viewAllProjects")}
                </span>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-brand px-2.5 text-xs font-semibold text-surface">
                  {tApp("attention.filterAll")}
                  <span className="tabular-nums opacity-80">4</span>
                </span>
                <span className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-destructive" />
                  {tApp("attention.kinds.overdue")}
                  <span className="tabular-nums opacity-60">1</span>
                </span>
                <span className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-action" />
                  {tApp("attention.kinds.docs_review")}
                  <span className="tabular-nums opacity-60">2</span>
                </span>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <section>
                  <h3 className="border-b border-destructive/20 pb-1.5 text-[11px] font-semibold tracking-wide text-destructive uppercase">
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-destructive align-middle" />
                    {tApp("attention.kinds.overdue")}
                  </h3>
                  <AttentionRow
                    title={t("preview.projectDubois")}
                    detail={tApp("attention.kinds.docs_review")}
                    meta={tApp("timing.overdue", { days: 4 })}
                    metaClass="text-destructive"
                  />
                </section>
                <section className="mt-4">
                  <h3 className="border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-brand uppercase">
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-action align-middle" />
                    {tApp("attention.kinds.docs_review")}
                  </h3>
                  <AttentionRow
                    title={t("preview.projectChen")}
                    detail={tApp("attention.kinds.stuck")}
                    meta={tApp("attention.docsCount", { count: 3 })}
                    metaClass="text-brand"
                  />
                </section>
                <section className="mt-4">
                  <h3 className="border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-brand uppercase">
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-action align-middle" />
                    {tApp("attention.kinds.questionnaire")}
                  </h3>
                  <AttentionRow
                    title={t("preview.projectOkonkwo")}
                    detail={tApp("attention.kinds.unpaid")}
                    meta={t("preview.unpaidAmount")}
                    metaClass="text-brand"
                  />
                </section>
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-7 flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-5">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="font-heading text-base font-semibold text-brand">
                    {tApp("timing.today")}
                  </h2>
                  <span className="tabular-nums text-sm font-semibold text-action">
                    2
                  </span>
                </div>
                <span className="text-xs font-medium text-action">
                  {tApp("appointments.viewCalendar")}
                </span>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden pt-1">
                <div className="relative min-w-0">
                  <span className="absolute top-2 bottom-2 left-[calc(5.25rem+0.5rem+0.5rem)] w-px -translate-x-1/2 bg-border" />
                  <div className="flex min-w-0 gap-2 py-2">
                    <div className="w-[5.25rem] shrink-0 pt-0.5 text-right">
                      <p className="text-[13px] font-semibold text-brand tabular-nums">
                        10:00
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        10:30
                      </p>
                    </div>
                    <span className="relative z-10 flex w-4 shrink-0 justify-center pt-1.5">
                      <span className="size-2.5 rounded-full bg-action ring-4 ring-surface" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-brand">
                          {t("preview.guestPriya")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t("preview.serviceConsult")}
                          {" · "}
                          {tApp("appointments.durationMinutes", { minutes: 30 })}
                        </p>
                      </div>
                      <span className="inline-flex h-7 shrink-0 items-center rounded-lg bg-action px-2.5 text-xs font-semibold text-action-foreground">
                        {tApp("appointments.joinNow")}
                      </span>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 py-2">
                    <p className="w-[5.25rem] shrink-0 text-right text-[10px] font-semibold tracking-wide text-destructive uppercase">
                      {tApp("appointments.now")}
                    </p>
                    <span className="relative z-10 flex w-4 shrink-0 justify-center">
                      <span className="size-2.5 rounded-full bg-destructive ring-4 ring-surface" />
                    </span>
                    <span className="h-px min-w-0 flex-1 bg-destructive/30" />
                  </div>
                  <div className="flex min-w-0 gap-2 py-2">
                    <div className="w-[5.25rem] shrink-0 pt-0.5 text-right">
                      <p className="text-[13px] font-semibold text-brand tabular-nums">
                        14:30
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        15:15
                      </p>
                    </div>
                    <span className="relative z-10 flex w-4 shrink-0 justify-center pt-1.5">
                      <span className="size-2.5 rounded-full bg-brand ring-4 ring-surface" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-brand">
                        {t("preview.guestLucas")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("preview.servicePgwp")}
                        {" · "}
                        {tApp("appointments.durationMinutes", { minutes: 45 })}
                        {" · "}
                        {tApp("appointments.unpaid")}
                      </p>
                    </div>
                  </div>
                </div>
                <h3 className="mt-6 flex items-baseline justify-between gap-2 border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <span>{tApp("appointments.laterHeading")}</span>
                  <span className="tabular-nums font-medium normal-case">
                    {tApp("appointments.weekCount", { count: 6 })}
                  </span>
                </h3>
                <div className="flex min-w-0 items-center gap-3 py-2">
                  <p className="w-[4.5rem] shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">
                    09:00
                  </p>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand">
                      {t("preview.personAmina")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("preview.serviceConsult")}
                    </p>
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function AppCalendarPreview({
  fadeBottom = false,
  tone = "dark",
}: {
  fadeBottom?: boolean;
  tone?: "dark" | "light";
}) {
  const locale = await getLocale();
  const [t, tApp, tNav, tTop, tCal, tAuth] = await Promise.all([
    getTranslations("home"),
    getTranslations("appHome"),
    getTranslations("nav"),
    getTranslations("topBar"),
    getTranslations("calendar"),
    getTranslations("auth"),
  ]);

  const start = weekStartsOn(locale);
  const orderedWeekdays = [
    ...WEEKDAY_KEYS.slice(start),
    ...WEEKDAY_KEYS.slice(0, start),
  ];
  const cells = monthGrid(BOOKING_YEAR, BOOKING_MONTH, start);
  const selectedNoon = zonedCivilToUtc(BOOKING_SELECTED, "12:00", BOOKING_ZONE);
  const selectedStart = zonedCivilToUtc(BOOKING_SELECTED, "10:00", BOOKING_ZONE);
  const selectedEnd = zonedCivilToUtc(BOOKING_SELECTED, "11:00", BOOKING_ZONE);
  const consultPrice = formatPriceCents(15000, locale, "CAD");
  const gridHeight = CAL_TIMELINE_HOURS * CAL_HOUR_PX;
  const hours = Array.from(
    { length: CAL_TIMELINE_HOURS },
    (_, index) => CAL_TIMELINE_START + index,
  );

  return (
    <ProductChrome
      url={t("preview.urlCalendar")}
      fadeBottom={fadeBottom}
      tone={tone}
      innerHeight={680}
    >
      <PreviewSidebar
        orgName={t("preview.orgName")}
        active="calendar"
        newProject={tApp("newProject")}
        newPerson={tApp("newPerson")}
        signOut={tAuth("signOut")}
        navLabels={{
          home: tNav("home"),
          projects: tNav("projects"),
          people: tNav("people"),
          calendar: tNav("calendar"),
          bookings: tNav("bookings"),
          services: tNav("services"),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <PreviewTopBar
          crumb={tTop("crumbCalendar")}
          searchPlaceholder={tTop("searchPlaceholder")}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <h1 className="font-heading text-xl font-semibold text-brand">
                {tCal("title")}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {tCal("subtitle")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-2",
                )}
              >
                <Link2 className="size-4" aria-hidden />
                {tCal("copyLink")}
              </span>
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "gap-2",
                )}
              >
                <Settings2 className="size-4" aria-hidden />
                {tCal("settings")}
              </span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(20rem,1fr)] gap-4 overflow-hidden">
            <SurfaceCard className="flex min-h-0 flex-col overflow-hidden p-4">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-semibold text-brand">
                  {formatMonthYear(BOOKING_YEAR, BOOKING_MONTH, locale)}
                </h2>
                <div className="flex items-center gap-1">
                  <span className="inline-flex size-8 items-center justify-center rounded-xl border border-border bg-surface">
                    <ChevronLeft className="size-4" />
                  </span>
                  <span className="inline-flex size-8 items-center justify-center rounded-xl border border-border bg-surface">
                    <ChevronRight className="size-4" />
                  </span>
                </div>
              </div>
              <div className="mt-3 grid shrink-0 grid-cols-7 gap-1 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {orderedWeekdays.map((key) => (
                  <div key={key} className="py-1">
                    {tCal(`weekdaysShort.${key}`)}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
                {cells.map((cell) => {
                  const count = CALENDAR_MARKERS[cell.dateIso] ?? 0;
                  const selected = cell.dateIso === BOOKING_SELECTED;
                  const isBlocked = CALENDAR_BLOCKED.has(cell.dateIso);
                  const hasOpenHours = BOOKING_AVAILABLE.has(cell.dateIso);
                  const dayNumber = Number(cell.dateIso.slice(8, 10));
                  return (
                    <div
                      key={cell.dateIso}
                      className={cn(
                        "relative flex min-h-0 flex-col items-center justify-center rounded-xl border px-1 py-1 text-sm",
                        cell.inMonth
                          ? "bg-surface"
                          : "bg-canvas/60 text-muted-foreground",
                        selected
                          ? "border-action bg-action/5 text-brand"
                          : "border-transparent",
                        isBlocked &&
                          !selected &&
                          "border-graphite-200 bg-blocked-bg text-blocked-text",
                        isBlocked && selected && "border-blocked bg-blocked-bg",
                      )}
                    >
                      {isBlocked ? (
                        <Ban
                          className="absolute top-1 right-1 size-2.5 text-blocked"
                          aria-hidden
                        />
                      ) : null}
                      <span className="inline-flex size-6 items-center justify-center rounded-full text-[13px]">
                        {dayNumber}
                      </span>
                      {count > 0 || hasOpenHours || isBlocked ? (
                        <span className="mt-0.5 flex items-center gap-0.5">
                          {count > 0 ? (
                            <span className="h-1 w-1 rounded-full bg-action" />
                          ) : null}
                          {hasOpenHours ? (
                            <span className="h-1 w-1 rounded-full bg-success" />
                          ) : null}
                          {isBlocked && count === 0 ? (
                            <span className="h-1 w-1 rounded-full bg-blocked" />
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-action" />
                  {tCal("legendBookings")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {tCal("legendOpen")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Ban className="size-3 text-blocked" aria-hidden />
                  {tCal("legendBlocked")}
                </span>
              </div>
            </SurfaceCard>

            <SurfaceCard className="flex min-h-0 flex-col gap-3 overflow-hidden p-4">
              <div className="flex shrink-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {tCal("dayDetail")}
                  </p>
                  <h2 className="font-heading truncate text-base font-semibold text-brand">
                    {formatDateInZone(selectedNoon, BOOKING_ZONE, locale)}
                  </h2>
                </div>
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "gap-2",
                  )}
                >
                  <Ban className="size-4" />
                  {tCal("blockDay")}
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-emerald-100 ring-1 ring-success/60" />
                  {tCal("legendOpen")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-action" />
                  {tCal("legendBookings")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-blocked" />
                  {tCal("legendBlocked")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-slate-300" />
                  {tCal("legendExternal")}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface">
                <div
                  className="grid"
                  style={{ gridTemplateColumns: "3rem minmax(0, 1fr)" }}
                >
                  <div
                    className="relative border-r border-border bg-canvas/80"
                    style={{ height: gridHeight }}
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
                        style={{
                          top: (hour - CAL_TIMELINE_START) * CAL_HOUR_PX + 2,
                        }}
                      >
                        {previewHourLabel(hour, locale)}
                      </div>
                    ))}
                  </div>
                  <div
                    className="relative bg-canvas/40"
                    style={{ height: gridHeight }}
                  >
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                        style={{
                          top: (hour - CAL_TIMELINE_START) * CAL_HOUR_PX,
                          height: CAL_HOUR_PX,
                        }}
                      >
                        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
                      </div>
                    ))}
                    <div
                      className="pointer-events-none absolute inset-x-0 z-0 bg-success-bg/70"
                      style={previewRangeStyle(9, 17)}
                      aria-hidden
                    />
                    <div
                      className="absolute inset-x-1 z-[1] overflow-hidden rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-left text-[11px] leading-tight text-slate-700"
                      style={previewRangeStyle(9, 10)}
                    >
                      <p className="truncate font-medium tabular-nums">
                        {previewHourLabel(9, locale)}–{previewHourLabel(10, locale)}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {tCal("googleBusyLabel")}
                      </p>
                    </div>
                    <div
                      className="absolute inset-x-1 z-[3] overflow-hidden rounded-md bg-action-hover px-1.5 py-0.5 text-left text-[11px] leading-tight text-action-foreground shadow-sm ring-2 ring-action ring-offset-1"
                      style={previewRangeStyle(10, 11)}
                    >
                      <p className="truncate font-medium tabular-nums">
                        {previewHourLabel(10, locale)}–{previewHourLabel(11, locale)}
                      </p>
                      <p className="truncate text-[10px] text-action-foreground/90">
                        {t("preview.guestPriya")}
                      </p>
                    </div>
                    <div
                      className="absolute inset-x-1 z-[2] overflow-hidden rounded-md border border-graphite-200 bg-blocked-bg/90 px-1.5 py-0.5 text-left text-[11px] leading-tight text-blocked-text"
                      style={previewRangeStyle(12, 13)}
                    >
                      <p className="truncate font-medium">{tCal("legendBlocked")}</p>
                      <p className="truncate text-[10px] tabular-nums text-blocked-text/80">
                        {previewHourLabel(12, locale)}–{previewHourLabel(13, locale)}
                      </p>
                    </div>
                    <div
                      className="absolute inset-x-1 z-[3] overflow-hidden rounded-md bg-action px-1.5 py-0.5 text-left text-[11px] leading-tight text-action-foreground shadow-sm"
                      style={previewRangeStyle(14, 15)}
                    >
                      <p className="truncate font-medium tabular-nums">
                        {previewHourLabel(14, locale)}–{previewHourLabel(15, locale)}
                      </p>
                      <p className="truncate text-[10px] text-action-foreground/90">
                        {t("preview.guestLucas")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 rounded-xl border border-border bg-canvas/50 p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-heading text-base font-semibold text-brand">
                      {t("preview.guestPriya")}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {t("preview.serviceConsult")} · {consultPrice}
                    </p>
                  </div>
                  <StatusPill
                    label={tCal("status.confirmed")}
                    tone="action"
                  />
                </div>
                <div className="mt-3 rounded-lg border border-border/80 bg-surface px-3 py-2">
                  <p className="text-sm font-medium text-brand">
                    {formatDateTimeInZone(selectedStart, BOOKING_ZONE, locale)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeInZone(selectedStart, BOOKING_ZONE, locale)}
                    {" – "}
                    {formatTimeInZone(selectedEnd, BOOKING_ZONE, locale)}
                    {" · "}
                    {tCal("hostedBy", { name: t("preview.userFullName") })}
                  </p>
                </div>
                <p className="mt-2 text-xs font-medium text-action">
                  {tCal("joinMeet")}
                </p>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function AppProjectPreview() {
  const locale = await getLocale();
  const [t, tApp, tNav, tTop, tProj, tProg, tRoles, tAuth] =
    await Promise.all([
      getTranslations("home"),
      getTranslations("appHome"),
      getTranslations("nav"),
      getTranslations("topBar"),
      getTranslations("projects"),
      getTranslations("programs"),
      getTranslations("roles"),
      getTranslations("auth"),
    ]);

  const opened = new Date("2026-03-04").toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <ProductChrome url={t("preview.urlProject")} tone="light" innerHeight={560}>
      <PreviewSidebar
        orgName={t("preview.orgName")}
        active="projects"
        newProject={tApp("newProject")}
        newPerson={tApp("newPerson")}
        signOut={tAuth("signOut")}
        navLabels={{
          home: tNav("home"),
          projects: tNav("projects"),
          people: tNav("people"),
          calendar: tNav("calendar"),
          bookings: tNav("bookings"),
          services: tNav("services"),
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <PreviewTopBar
          crumb={`${tTop("crumbProjects")} / ${t("preview.projectChen")}`}
          searchPlaceholder={tTop("searchPlaceholder")}
        />
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-hidden px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand">
                  {t("preview.projectChen")}
                </h1>
                <StatusPill
                  label={tProj("statuses.in_progress")}
                  tone="action"
                />
              </div>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span className="font-medium text-brand/85">
                  {tProg("express_entry")}
                </span>
                <span aria-hidden>·</span>
                <span>{tProj("formLanguages.en")}</span>
                <span aria-hidden>·</span>
                <span>
                  {tProj("opened")} {opened}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="inline-flex h-9 items-center rounded-xl bg-action px-3 text-sm font-semibold text-action-foreground">
                {tProj("edit")}
              </span>
              <p className="text-sm text-muted-foreground">
                {tProj("representative")} · {t("preview.userFullName")}
              </p>
            </div>
          </div>

          <div className="flex gap-1">
            <TabChip label={tProj("detailTabs.home")} active />
            <TabChip label={tProj("detailTabs.documents")} />
            <TabChip label={tProj("detailTabs.forms")} />
            <TabChip label={tProj("detailTabs.communication")} />
            <TabChip label={tProj("detailTabs.payments")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SurfaceCard className="p-5">
              <p className="text-sm font-medium text-muted-foreground">
                {tProj("columnDocuments")}
              </p>
              <div className="mt-3">
                <ProgressMeter
                  valueLabel={tProj("docsProgress", { done: 6, total: 9 })}
                  percent={docsPercent(6, 9)}
                />
              </div>
            </SurfaceCard>
            <SurfaceCard className="p-5">
              <p className="text-sm font-medium text-muted-foreground">
                {tProj("columnForms")}
              </p>
              <div className="mt-3">
                <ProgressMeter
                  valueLabel={tProj("formsProgress", { percent: 72 })}
                  percent={72}
                />
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard className="space-y-2 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {tProj("portal.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {tProj("portal.recipients", {
                    names: t("preview.personWei"),
                  })}
                </p>
              </div>
              <span className="inline-flex h-9 shrink-0 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold">
                {tProj("portal.copy")}
              </span>
            </div>
          </SurfaceCard>

          <SurfaceCard className="space-y-3 p-5">
            <h2 className="font-heading text-sm font-semibold text-brand">
              {tProj("participants")}
            </h2>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-2">
                <p className="text-sm font-medium text-brand">
                  {t("preview.personWei")}
                </p>
                <StatusPill label={tRoles("principal")} tone="action" />
              </div>
              <div className="flex items-center justify-between py-2">
                <p className="text-sm font-medium text-brand">
                  {t("preview.personMei")}
                </p>
                <StatusPill label={tRoles("spouse")} tone="muted" />
              </div>
            </div>
          </SurfaceCard>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function ClientFillPreview() {
  const [t, tDocs] = await Promise.all([
    getTranslations("home"),
    getTranslations("documents"),
  ]);

  const rows = [
    {
      label: tDocs("keys.passport"),
      person: t("preview.personWei"),
      pill: tDocs("pills.completed"),
      tone: "success" as const,
    },
    {
      label: tDocs("keys.photo"),
      person: t("preview.personWei"),
      pill: tDocs("pills.submitted"),
      tone: "action" as const,
    },
    {
      label: t("preview.docStudyLetter"),
      person: t("preview.personWei"),
      pill: tDocs("pills.waiting"),
      tone: "warning" as const,
    },
    {
      label: tDocs("keys.passport"),
      person: t("preview.personMei"),
      pill: tDocs("pills.completed"),
      tone: "success" as const,
    },
  ];

  return (
    <ProductChrome url={t("preview.urlPortal")} tone="light" innerHeight={520}>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-8 py-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {tDocs("clientEyebrow")}
            </p>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {t("preview.projectChen")}
            </h1>
          </div>

          <div className="flex gap-1">
            <TabChip label={tDocs("clientTabs.documents")} active />
            <TabChip label={tDocs("clientTabs.forms")} />
          </div>

          <p className="text-sm text-muted-foreground">{tDocs("clientLede")}</p>

          <SurfaceCard className="divide-y divide-border p-0">
            {rows.map((row, index) => (
              <div
                key={`${row.person}-${row.label}-${index}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-brand">
                    {row.label}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {row.person}
                  </p>
                </div>
                <StatusPill label={row.pill} tone={row.tone} />
              </div>
            ))}
          </SurfaceCard>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function ClientPortalPreview() {
  const locale = await getLocale();
  const [t, tPortal, tProg, tRoles, tPay, tAuth, tProj] = await Promise.all([
    getTranslations("home"),
    getTranslations("portal"),
    getTranslations("programs"),
    getTranslations("roles"),
    getTranslations("publicPay"),
    getTranslations("auth"),
    getTranslations("projects"),
  ]);

  const chenOpened = new Date("2026-03-04").toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const appointmentWhen = new Date(
    zonedCivilToUtc(BOOKING_SELECTED, "10:00", BOOKING_ZONE),
  ).toLocaleString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es" : "en-CA",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );

  return (
    <ProductChrome url={t("preview.urlPortal")} tone="light" innerHeight={560}>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
          <BrandLogo href={null} size="sm" inverted className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {t("preview.orgName")}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              {t("preview.personWei")}
            </p>
          </div>
          <span className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground/80">
            {tPortal("home")}
          </span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent px-3 text-sm font-medium text-sidebar-foreground">
            <LogOut className="size-3.5 shrink-0" aria-hidden />
            {tAuth("signOut")}
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-hidden px-6 py-6">
          <header className="space-y-1">
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {tPortal("hello", { name: "Wei" })}
            </h1>
            <p className="text-[15px] text-muted-foreground">{tPortal("lede")}</p>
          </header>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {tPortal("files")}
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-brand">
                    {t("preview.projectChen")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tProg("express_entry")} · {tRoles("principal")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tPortal("progress", {
                      forms: 72,
                      docsDone: 6,
                      docsTotal: 9,
                    })}
                  </p>
                </div>
                <span className="inline-flex flex-col items-end gap-0.5 text-xs">
                  <span className="font-semibold tracking-wide text-brand uppercase">
                    {tProj("statuses.in_progress")}
                  </span>
                  <span className="text-muted-foreground">{chenOpened}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-brand">
                    {t("preview.projectDubois")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tProg("study_permit")} · {tRoles("principal")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tPortal("progress", {
                      forms: 40,
                      docsDone: 2,
                      docsTotal: 8,
                    })}
                  </p>
                </div>
                <span className="inline-flex flex-col items-end gap-0.5 text-xs">
                  <span className="font-semibold tracking-wide text-brand uppercase">
                    {tProj("statuses.in_progress")}
                  </span>
                  <span className="text-muted-foreground">{chenOpened}</span>
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {tPortal("payments")}
            </h2>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3.5 shadow-elevated">
              <div>
                <p className="font-medium text-brand">
                  {t("preview.serviceConsult")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("preview.unpaidAmount")} · {tPortal("paymentStatus.pending")}
                </p>
              </div>
              <span
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-action text-action-foreground",
                )}
              >
                {tPay("payWithSquare")}
              </span>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {tPortal("appointments")}
            </h2>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3.5 shadow-elevated">
              <div>
                <p className="font-medium text-brand">
                  {t("preview.serviceConsult")}
                </p>
                <p className="text-sm text-muted-foreground">{appointmentWhen}</p>
              </div>
              <div className="flex gap-2">
                <span
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {tPortal("joinMeet")}
                </span>
                <span
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  {tPortal("manage")}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function PublicBookingPreview() {
  const locale = await getLocale();
  const [t, tBook, tCal, tLegal] = await Promise.all([
    getTranslations("home"),
    getTranslations("booking"),
    getTranslations("calendar"),
    getTranslations("legal"),
  ]);

  const start = weekStartsOn(locale);
  const orderedWeekdays = [
    ...WEEKDAY_KEYS.slice(start),
    ...WEEKDAY_KEYS.slice(0, start),
  ];
  const cells = monthGrid(BOOKING_YEAR, BOOKING_MONTH, start);
  const selectedStart = zonedCivilToUtc(
    BOOKING_SELECTED,
    "10:00",
    BOOKING_ZONE,
  );
  const selectedWhen = formatDateTimeInZone(selectedStart, BOOKING_ZONE, locale);
  const dayHeading = formatDateInZone(selectedStart, BOOKING_ZONE, locale);
  const consultPrice = formatPriceCents(15000, locale, "CAD");
  const pgwpPrice = formatPriceCents(25000, locale, "CAD");

  return (
    <ProductChrome url={t("preview.urlBook")} tone="light" innerHeight={620}>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas px-6 py-4">
        <header className="flex shrink-0 items-center justify-between gap-4 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size="sm" href={null} />
            <div className="min-w-0 border-l border-border pl-3">
              <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("preview.orgName")}
              </p>
              <h1 className="font-heading truncate text-xl font-semibold text-brand">
                {tBook("title")}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-sm font-medium text-brand">
              {tBook("bookingWith", { name: t("preview.userFullName") })}
            </p>
            <span className="text-xs text-muted-foreground/80">
              {tLegal("privacyLink")}
            </span>
          </div>
        </header>

        <section className="shrink-0 space-y-1.5 pb-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {tBook("chooseService")}
          </h2>
          <div className="flex gap-2">
            <div className="rounded-xl border border-border bg-surface px-3 py-2 text-left">
              <p className="text-sm font-semibold text-brand">
                {t("preview.serviceConsult")}
              </p>
              <p className="mt-0.5 max-w-[16rem] text-xs text-muted-foreground">
                {t("preview.serviceConsultDesc")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tBook("durationMinutes", { minutes: 45 })}
                {" · "}
                {consultPrice}
              </p>
            </div>
            <div className="rounded-xl border border-action bg-action/5 px-3 py-2 text-left">
              <p className="text-sm font-semibold text-brand">
                {t("preview.servicePgwp")}
              </p>
              <p className="mt-0.5 max-w-[16rem] text-xs text-muted-foreground">
                {t("preview.servicePgwpDesc")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tBook("durationMinutes", { minutes: 30 })}
                {" · "}
                {pgwpPrice}
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 gap-5">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-surface p-4">
            <div className="flex shrink-0 items-center justify-between gap-3">
              <h2 className="font-heading text-base font-semibold text-brand">
                {formatMonthYear(BOOKING_YEAR, BOOKING_MONTH, locale)}
              </h2>
              <div className="flex items-center gap-1">
                <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface">
                  <ChevronLeft className="size-4" />
                </span>
                <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface">
                  <ChevronRight className="size-4" />
                </span>
              </div>
            </div>
            <div className="mt-3 grid shrink-0 grid-cols-7 gap-1 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {orderedWeekdays.map((key) => (
                <div key={key} className="py-0.5">
                  {tCal(`weekdaysShort.${key}`)}
                </div>
              ))}
            </div>
            <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 gap-1">
              {cells.map((cell) => {
                const selected = cell.dateIso === BOOKING_SELECTED;
                const available = BOOKING_AVAILABLE.has(cell.dateIso);
                const dayNumber = Number(cell.dateIso.slice(8, 10));
                return (
                  <div
                    key={cell.dateIso}
                    className={cn(
                      "relative flex min-h-10 flex-col items-center rounded-xl border px-1 py-1",
                      cell.inMonth
                        ? "bg-surface"
                        : "bg-canvas/60 text-muted-foreground",
                      selected
                        ? "border-action bg-action/5 text-brand"
                        : "border-transparent",
                      !available && "opacity-40",
                    )}
                  >
                    <span className="inline-flex size-6 items-center justify-center rounded-full text-[13px]">
                      {dayNumber}
                    </span>
                    {available ? (
                      <span className="mt-0.5 h-1 w-1 rounded-full bg-success" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex w-[15.5rem] shrink-0 flex-col rounded-xl border border-border bg-surface p-4">
            <div className="shrink-0 pb-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {tBook("availableTimes")}
              </p>
              <p className="font-heading text-sm font-semibold text-brand">
                {dayHeading}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {tBook("timesInZone", {
                  zone: BOOKING_ZONE.replaceAll("_", " "),
                })}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {BOOKING_SLOT_HOURS.map((hour) => {
                const selected = hour === "10:00";
                const slotDate = zonedCivilToUtc(
                  BOOKING_SELECTED,
                  hour,
                  BOOKING_ZONE,
                );
                return (
                  <div
                    key={hour}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-center text-sm font-medium",
                      selected
                        ? "border-action bg-action text-action-foreground"
                        : "border-border bg-surface",
                    )}
                  >
                    {formatTimeInZone(slotDate, BOOKING_ZONE, locale)}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {t("preview.servicePgwp")} · {selectedWhen}
          </p>
          <span
            className={cn(
              buttonVariants(),
              "bg-action text-action-foreground",
            )}
          >
            {tBook("continue")}
            <ChevronRight data-icon="inline-end" />
          </span>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function PublicPayPreview() {
  const locale = await getLocale();
  const [t, tPay] = await Promise.all([
    getTranslations("home"),
    getTranslations("publicPay"),
  ]);

  return (
    <ProductChrome url={t("preview.urlPay")} tone="light" innerHeight={480}>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center bg-canvas px-8 py-10">
        <div className="w-full max-w-lg space-y-6 text-center">
          <BrandLogo size="sm" href={null} />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("preview.orgName")}</p>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {tPay("title")}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              {t("preview.serviceConsult")}
            </p>
            <p className="font-heading text-3xl font-semibold text-brand">
              {formatPriceCents(15000, locale, "CAD")}
            </p>
          </div>
          <div className="flex justify-center">
            <span
              className={cn(
                buttonVariants(),
                "bg-action text-action-foreground",
              )}
            >
              {tPay("payWithSquare")}
            </span>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function BookingConfirmedPreview() {
  const locale = await getLocale();
  const [t, tBook] = await Promise.all([
    getTranslations("home"),
    getTranslations("booking"),
  ]);
  const when = formatDateTimeInZone(
    zonedCivilToUtc(BOOKING_SELECTED, "10:00", BOOKING_ZONE),
    BOOKING_ZONE,
    locale,
  );

  return (
    <ProductChrome url={t("preview.urlBookConfirm")} tone="light" innerHeight={480}>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center bg-canvas px-8 py-10">
        <div className="w-full max-w-lg space-y-6 text-center">
          <BrandLogo size="sm" href={null} />
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {tBook("confirmedTitle")}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {tBook("confirmedBody", {
              service: t("preview.servicePgwp"),
              when,
              host: t("preview.userFullName"),
              org: t("preview.orgName"),
            })}
          </p>
          <div className="flex justify-center">
            <span
              className={cn(
                buttonVariants(),
                "bg-action text-action-foreground",
              )}
            >
              {tBook("joinMeet")}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">{tBook("manageHint")}</p>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <span className="font-medium text-action">{tBook("changeTime")}</span>
              <span className="font-medium text-muted-foreground">
                {tBook("cancelAppointment")}
              </span>
            </p>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

