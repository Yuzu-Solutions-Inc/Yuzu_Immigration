import {
  Bell,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FolderKanban,
  Home,
  LogOut,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PipelineDonut } from "@/components/home/caseload-charts";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { ProductChrome } from "@/components/marketing/product-chrome";
import { SurfaceCard } from "@/components/layout/surface-card";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/booking/slots";
import { projectStatusTone } from "@/lib/crm/statuses";
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
  accent = "none",
}: {
  label: string;
  value: number;
  hint: string;
  accent?: "none" | "action" | "warning" | "danger";
}) {
  const mark =
    accent === "danger"
      ? "bg-destructive"
      : accent === "warning"
        ? "bg-warning"
        : accent === "action"
          ? "bg-action"
          : null;

  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "font-heading text-[1.5rem] leading-none font-semibold tracking-tight tabular-nums",
            accent === "danger" ? "text-destructive" : "text-brand",
          )}
        >
          {value}
        </p>
        {mark ? (
          <span className={cn("size-1.5 shrink-0 rounded-full", mark)} />
        ) : null}
      </div>
      <p className="truncate text-[13px] font-medium text-brand">{label}</p>
      <p className="truncate text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

function AttentionRow({
  kind,
  title,
  status,
  meta,
  metaClass,
  docs,
  forms,
}: {
  kind: { label: string; tone: StatusPillTone };
  title: string;
  status?: string;
  meta: string;
  metaClass: string;
  docs?: { done: number; total: number; label: string };
  forms?: { percent: number; label: string };
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <StatusPill
            label={kind.label}
            tone={kind.tone}
            className="px-2 py-0 text-[10px]"
          />
          <p className="truncate text-sm font-medium text-brand">{title}</p>
        </div>
        {status ? (
          <p className="text-[11px] text-muted-foreground">{status}</p>
        ) : null}
        {docs && forms ? (
          <div className="flex gap-3">
            <ProgressMeter
              compact
              valueLabel={docs.label}
              percent={docsPercent(docs.done, docs.total)}
            />
            <ProgressMeter
              compact
              valueLabel={forms.label}
              percent={forms.percent}
            />
          </div>
        ) : null}
      </div>
      <p className={cn("shrink-0 text-right text-sm font-medium", metaClass)}>
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
  const [t, tApp, tNav, tTop, tProj, tImm, tAuth] = await Promise.all([
    getTranslations("home"),
    getTranslations("appHome"),
    getTranslations("nav"),
    getTranslations("topBar"),
    getTranslations("projects"),
    getTranslations("immigrationStatus"),
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
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-5 py-4">
          <div className="flex shrink-0 items-end justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1 className="font-heading text-xl font-semibold text-brand">
                  {tApp("welcome", { name: t("preview.userName") })}
                </h1>
                <p className="text-xs text-muted-foreground">{dateLabel}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {tApp("actionSummary", { count: 9, bookings: 2 })}
              </p>
            </div>
            <span className="inline-flex h-9 items-center rounded-xl bg-action px-3 text-sm font-semibold text-action-foreground">
              {tApp("newProject")}
            </span>
          </div>

          <div className="grid shrink-0 grid-cols-6 divide-x divide-border overflow-hidden rounded-xl border border-border bg-surface">
            <PreviewKpi
              label={tApp("tiles.docsToReview")}
              value={3}
              hint={tApp("tiles.docsToReviewHint")}
              accent="action"
            />
            <PreviewKpi
              label={tApp("tiles.overdue")}
              value={1}
              hint={tApp("dueIn14", { count: 2 })}
              accent="danger"
            />
            <PreviewKpi
              label={tApp("tiles.stuck")}
              value={2}
              hint={tApp("tiles.stuckHint")}
              accent="warning"
            />
            <PreviewKpi
              label={tApp("tiles.unpaid")}
              value={1}
              hint={tApp("tiles.unpaidHint")}
              accent="warning"
            />
            <PreviewKpi
              label={tApp("tiles.todayBookings")}
              value={2}
              hint={tApp("tiles.weekBookings", { count: 6 })}
              accent="action"
            />
            <PreviewKpi
              label={tApp("tiles.statusExpiring")}
              value={2}
              hint={tApp("tiles.statusExpiringHint")}
              accent="warning"
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-12 gap-2.5">
            <SurfaceCard className="col-span-5 flex min-h-0 flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {tApp("attention.title")}
                </h2>
                <span className="text-xs font-medium text-action">
                  {tApp("viewAllProjects")}
                </span>
              </div>
              <div className="divide-y divide-border">
                <AttentionRow
                  kind={{
                    label: tApp("attention.kinds.docs_review"),
                    tone: "action",
                  }}
                  title={t("preview.projectChen")}
                  status={tProj("statuses.in_progress")}
                  meta={tApp("attention.docsCount", { count: 3 })}
                  metaClass="text-brand"
                  docs={{
                    done: 6,
                    total: 9,
                    label: tApp("upcoming.docs", { done: 6, total: 9 }),
                  }}
                  forms={{
                    percent: 72,
                    label: tApp("upcoming.forms", { percent: 72 }),
                  }}
                />
                <AttentionRow
                  kind={{
                    label: tApp("attention.kinds.overdue"),
                    tone: "destructive",
                  }}
                  title={t("preview.projectDubois")}
                  status={tProj("statuses.in_progress")}
                  meta={tApp("timing.overdue", { days: 4 })}
                  metaClass="text-destructive"
                />
                <AttentionRow
                  kind={{
                    label: tApp("attention.kinds.stuck"),
                    tone: "warning",
                  }}
                  title={t("preview.projectOkonkwo")}
                  status={tProj("statuses.stuck")}
                  meta={tApp("attention.docsCount", { count: 2 })}
                  metaClass="text-brand"
                />
                <AttentionRow
                  kind={{
                    label: tApp("attention.kinds.unpaid"),
                    tone: "warning",
                  }}
                  title={t("preview.guestPriya")}
                  meta={t("preview.unpaidAmount")}
                  metaClass="text-brand"
                />
              </div>
            </SurfaceCard>

            <SurfaceCard className="col-span-4 flex min-h-0 flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {tApp("appointments.title")}
                </h2>
                <span className="text-xs font-medium text-action">
                  {tApp("appointments.viewCalendar")}
                </span>
              </div>
              <div className="relative h-14 overflow-hidden rounded-lg bg-canvas">
                {["08", "10", "12", "14", "16", "18"].map((hour, i) => (
                  <div
                    key={hour}
                    className="absolute inset-y-0 border-l border-border/70"
                    style={{ left: `${(i / 5) * 100}%` }}
                  >
                    <span className="absolute top-0.5 left-1 text-[9px] tabular-nums text-muted-foreground">
                      {hour}
                    </span>
                  </div>
                ))}
                <div className="absolute top-5 bottom-1.5 left-[18%] w-[22%] overflow-hidden rounded-md bg-action/15 px-1.5 py-0.5 text-[10px] leading-tight font-medium text-action">
                  <span className="block truncate">{t("preview.guestPriya")}</span>
                </div>
                <div className="absolute top-5 bottom-1.5 left-[52%] w-[24%] overflow-hidden rounded-md bg-warning-bg px-1.5 py-0.5 text-[10px] leading-tight font-medium text-warning-text">
                  <span className="block truncate">{t("preview.guestLucas")}</span>
                </div>
                <div className="absolute inset-y-0 left-[38%] z-10 w-px bg-destructive" />
              </div>
              <div className="divide-y divide-border">
                <div className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand">
                      {t("preview.guestPriya")}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("preview.serviceConsult")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-brand">10:00</p>
                    <p className="text-[11px] font-medium text-action">
                      {tApp("timing.today")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand">
                      {t("preview.guestLucas")}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {t("preview.servicePgwp")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-brand">14:30</p>
                    <p className="text-[11px] font-medium text-action">
                      {tApp("timing.today")}
                    </p>
                  </div>
                </div>
              </div>
            </SurfaceCard>

            <div className="col-span-3 flex min-h-0 flex-col gap-2.5">
              <SurfaceCard className="shrink-0 space-y-2 p-4">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {tApp("charts.pipeline")}
                </h2>
                <PipelineDonut
                  empty={tApp("charts.pipelineEmpty")}
                  totalLabel={tApp("charts.pipelineTotal")}
                  items={[
                    {
                      key: "new",
                      label: tProj("statuses.new"),
                      count: 2,
                      tone: projectStatusTone("new"),
                    },
                    {
                      key: "in_progress",
                      label: tProj("statuses.in_progress"),
                      count: 5,
                      tone: projectStatusTone("in_progress"),
                    },
                    {
                      key: "waiting",
                      label: tProj("statuses.waiting"),
                      count: 3,
                      tone: projectStatusTone("waiting"),
                    },
                    {
                      key: "stuck",
                      label: tProj("statuses.stuck"),
                      count: 2,
                      tone: projectStatusTone("stuck"),
                    },
                    {
                      key: "submitted",
                      label: tProj("statuses.submitted"),
                      count: 4,
                      tone: projectStatusTone("submitted"),
                    },
                  ]}
                />
              </SurfaceCard>
              <SurfaceCard className="min-h-0 flex-1 space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-heading text-sm font-semibold text-brand">
                    {tApp("expiries.title")}
                  </h2>
                  <span className="text-xs font-medium text-action">
                    {tApp("expiries.viewPeople")}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-brand">
                        {t("preview.personAmina")}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {tImm("worker")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-warning-text">
                      {tApp("timing.inDays", { days: 12 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-brand">
                        {t("preview.guestLucas")}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {tImm("student")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {tApp("timing.inDays", { days: 21 })}
                    </span>
                  </div>
                </div>
              </SurfaceCard>
            </div>
          </div>
        </div>
      </div>
    </ProductChrome>
  );
}

export async function AppProjectPreview() {
  const locale = await getLocale();
  const [t, tApp, tNav, tTop, tProj, tProg, tForms, tRoles, tAuth] =
    await Promise.all([
      getTranslations("home"),
      getTranslations("appHome"),
      getTranslations("nav"),
      getTranslations("topBar"),
      getTranslations("projects"),
      getTranslations("programs"),
      getTranslations("forms"),
      getTranslations("roles"),
      getTranslations("auth"),
    ]);

  const opened = new Date("2026-03-04").toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const expires = new Date("2026-09-12").toLocaleDateString(
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
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand">
                {t("preview.projectChen")}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-brand/85">
                  {tProg("express_entry")}
                </p>
                <StatusPill label={tProj("formLanguages.en")} tone="muted" />
                <span className="text-sm text-muted-foreground">
                  {tProj("opened")} {opened}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={tProj("statuses.in_progress")}
                  tone="action"
                />
                <StatusPill
                  label={t("preview.userFullName")}
                  tone="muted"
                />
              </div>
            </div>
            <span className="inline-flex h-9 items-center rounded-xl bg-action px-3 text-sm font-semibold text-action-foreground">
              {tProj("edit")}
            </span>
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
                  {tForms("shareTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {tForms("shareActive", { date: expires })}
                </p>
              </div>
              <span className="inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold">
                {tForms("shareCopyButton")}
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
  const locale = await getLocale();
  const [t, tDocs, tForms] = await Promise.all([
    getTranslations("home"),
    getTranslations("documents"),
    getTranslations("forms"),
  ]);

  const expires = new Date("2026-09-12").toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );

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
    <ProductChrome url={t("preview.urlFill")} tone="light" innerHeight={520}>
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-8 py-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {tDocs("clientEyebrow")}
            </p>
            <h1 className="font-heading text-2xl font-semibold text-brand">
              {t("preview.projectChen")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tForms("clientExpires", { date: expires })}
            </p>
          </div>

          <div className="flex gap-1">
            <TabChip label={tDocs("shareTabs.documents")} active />
            <TabChip label={tDocs("shareTabs.forms")} />
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

