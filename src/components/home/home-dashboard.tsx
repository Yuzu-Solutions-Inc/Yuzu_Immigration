import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { PipelineDonut, TodayStrip } from "@/components/home/caseload-charts";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import type { ProjectStatus } from "@/db/schema";
import type { AttentionItem, HomeDashboard } from "@/lib/crm/dashboard";
import { formatDisplayDate } from "@/lib/crm/dates";
import { isTerminalStatus, projectStatusTone } from "@/lib/crm/statuses";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  clipToDayMinutes,
  formatDateInZone,
  formatTimeInZone,
  zonedDateIso,
  zonedParts,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

function timingLabel(
  days: number,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
) {
  if (days < 0) return t("timing.overdue", { days: Math.abs(days) });
  if (days === 0) return t("timing.today");
  return t("timing.inDays", { days });
}

function timingClass(days: number) {
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-warning-text";
  return "text-muted-foreground";
}

const KIND_TONE: Record<AttentionItem["kind"], StatusPillTone> = {
  overdue: "destructive",
  docs_review: "action",
  questionnaire: "action",
  unpaid: "warning",
  stuck: "warning",
  due_soon: "warning",
};

type KpiAccent = "none" | "action" | "warning" | "danger";

function KpiCell({
  href,
  label,
  value,
  hint,
  accent = "none",
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
  accent?: KpiAccent;
}) {
  const quiet = value === 0;
  const mark =
    accent === "danger"
      ? "bg-destructive"
      : accent === "warning"
        ? "bg-warning"
        : accent === "action"
          ? "bg-action"
          : null;

  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 px-3 py-2.5 transition-colors",
        "hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none",
        quiet && "opacity-65 hover:opacity-100",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "font-heading text-[1.5rem] leading-none font-semibold tracking-tight tabular-nums",
            quiet ? "text-muted-foreground" : "text-brand",
            accent === "danger" && !quiet && "text-destructive",
          )}
        >
          {value}
        </p>
        {mark ? (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", mark)}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-[13px] font-medium text-brand">{label}</p>
        {hint ? (
          <p className="truncate text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <SurfaceCard
      className={cn("flex min-h-0 flex-col gap-2.5 p-3 sm:p-4", className)}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-brand">{title}</h2>
        {href && linkLabel ? (
          <Link
            href={href}
            className="shrink-0 text-xs font-medium text-action hover:underline"
          >
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </SurfaceCard>
  );
}

function attentionMeta(
  item: AttentionItem,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
  locale: string,
) {
  if (item.kind === "docs_review" && item.count != null) {
    return t("attention.docsCount", { count: item.count });
  }
  if (item.kind === "unpaid" && item.amountCents != null) {
    return formatPriceCents(item.amountCents, locale, item.currency ?? "CAD");
  }
  if (item.days != null) return timingLabel(item.days, t);
  return null;
}

export async function HomeDashboardView({
  locale,
  displayName,
  canCreate,
  dashboard,
}: {
  locale: string;
  displayName: string | null;
  canCreate: boolean;
  dashboard: HomeDashboard;
}) {
  const [t, tp, ti] = await Promise.all([
    getTranslations("appHome"),
    getTranslations("projects"),
    getTranslations("immigrationStatus"),
  ]);

  const { kpis, booking } = dashboard;
  const now = new Date();
  const todayIso = zonedDateIso(now, booking.timezone);
  const nowParts = zonedParts(now, booking.timezone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const actionCount =
    kpis.docsToReview +
    kpis.overdueSubmissions +
    kpis.stuckWaiting +
    kpis.pendingPayments +
    kpis.statusExpiring30;

  const todayAppointments = dashboard.appointments.filter(
    (item) => zonedDateIso(new Date(item.startsAt), booking.timezone) === todayIso,
  );
  const laterAppointments = dashboard.appointments.filter(
    (item) => zonedDateIso(new Date(item.startsAt), booking.timezone) > todayIso,
  );
  const upcomingAppointments = [
    ...(todayAppointments.length > 0
      ? todayAppointments.filter((item) => new Date(item.startsAt) >= now)
      : todayAppointments),
    ...laterAppointments,
  ].slice(0, 6);

  const openPipeline = dashboard.projectsByStatus.filter(
    (row) => !isTerminalStatus(row.key as ProjectStatus),
  );

  return (
    <div className="flex flex-col gap-2.5 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="font-heading text-xl font-semibold text-brand sm:text-2xl lg:text-xl">
              {displayName
                ? t("welcome", { name: displayName })
                : t("welcomeFallback")}
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {formatDateInZone(now, booking.timezone, locale)}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {dashboard.hasCaseload
              ? actionCount > 0
                ? t("actionSummary", {
                    count: actionCount,
                    bookings: booking.todayCount,
                  })
                : t("actionSummaryClear", { bookings: booking.todayCount })
              : t("dashboardSubtitle")}
          </p>
        </div>
        {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
      </div>

      {!dashboard.hasCaseload ? (
        <SurfaceCard className="space-y-3 p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{t("emptyProjects")}</p>
          {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
        </SurfaceCard>
      ) : (
        <>
          <div
            role="navigation"
            aria-label={t("tiles.aria")}
            className="grid shrink-0 grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0"
          >
            <KpiCell
              href="/projects"
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              hint={t("tiles.docsToReviewHint")}
              accent={kpis.docsToReview > 0 ? "action" : "none"}
            />
            <KpiCell
              href="/projects"
              label={t("tiles.overdue")}
              value={kpis.overdueSubmissions}
              hint={t("dueIn14", { count: kpis.dueIn14Days })}
              accent={kpis.overdueSubmissions > 0 ? "danger" : "none"}
            />
            <KpiCell
              href="/projects"
              label={t("tiles.stuck")}
              value={kpis.stuckWaiting}
              hint={t("tiles.stuckHint")}
              accent={kpis.stuckWaiting > 0 ? "warning" : "none"}
            />
            <KpiCell
              href="/bookings"
              label={t("tiles.unpaid")}
              value={kpis.pendingPayments}
              hint={t("tiles.unpaidHint")}
              accent={kpis.pendingPayments > 0 ? "warning" : "none"}
            />
            <KpiCell
              href="/calendar"
              label={t("tiles.todayBookings")}
              value={booking.todayCount}
              hint={t("tiles.weekBookings", { count: booking.next7Count })}
              accent={booking.todayCount > 0 ? "action" : "none"}
            />
            <KpiCell
              href="/people"
              label={t("tiles.statusExpiring")}
              value={kpis.statusExpiring30}
              hint={t("tiles.statusExpiringHint")}
              accent={kpis.statusExpiring30 > 0 ? "warning" : "none"}
            />
          </div>

          {booking.needsSetup ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-warning-bg px-3 py-1.5 text-sm text-warning-text">
              <span className="inline-flex items-center gap-2">
                <Briefcase className="size-4 shrink-0" aria-hidden />
                {t("bookingSetup.banner")}
              </span>
              <span className="flex flex-wrap gap-3">
                <Link
                  href="/services"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {t("bookingSetup.services")}
                </Link>
                <Link
                  href="/calendar/settings"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {t("bookingSetup.hours")}
                </Link>
              </span>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-12 lg:overflow-hidden">
            <Panel
              title={t("attention.title")}
              href="/projects"
              linkLabel={t("viewAllProjects")}
              className="lg:col-span-5 lg:overflow-hidden"
            >
              {dashboard.attention.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("attention.empty")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {dashboard.attention.map((item) => {
                    const meta = attentionMeta(item, t, locale);
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="flex items-start justify-between gap-3 py-2 transition-colors hover:bg-muted/40"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <StatusPill
                                label={t(`attention.kinds.${item.kind}`)}
                                tone={KIND_TONE[item.kind]}
                                className="px-2 py-0 text-[10px]"
                              />
                              <p className="truncate text-sm font-medium text-brand">
                                {item.title}
                              </p>
                            </div>
                            {item.status ||
                            (item.count && item.kind !== "docs_review") ? (
                              <p className="text-[11px] text-muted-foreground">
                                {item.status
                                  ? tp(`statuses.${item.status}`)
                                  : null}
                                {item.status &&
                                item.count &&
                                item.kind !== "docs_review"
                                  ? " · "
                                  : null}
                                {item.count && item.kind !== "docs_review"
                                  ? t("attention.docsCount", {
                                      count: item.count,
                                    })
                                  : null}
                              </p>
                            ) : null}
                            {item.docsTotal != null && item.formPercent != null ? (
                              <div className="flex gap-3">
                                <ProgressMeter
                                  compact
                                  valueLabel={t("upcoming.docs", {
                                    done: item.docsDone ?? 0,
                                    total: item.docsTotal,
                                  })}
                                  percent={docsPercent(
                                    item.docsDone ?? 0,
                                    item.docsTotal,
                                  )}
                                />
                                <ProgressMeter
                                  compact
                                  valueLabel={t("upcoming.forms", {
                                    percent: item.formPercent,
                                  })}
                                  percent={item.formPercent}
                                />
                              </div>
                            ) : null}
                          </div>
                          {meta ? (
                            <p
                              className={cn(
                                "shrink-0 text-right text-sm font-medium",
                                item.days != null
                                  ? timingClass(item.days)
                                  : "text-brand",
                              )}
                            >
                              {meta}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel
              title={t("appointments.title")}
              href="/calendar"
              linkLabel={t("appointments.viewCalendar")}
              className="lg:col-span-4 lg:overflow-hidden"
            >
              <div className="flex min-h-0 flex-col gap-2.5">
                {todayAppointments.length > 0 ? (
                  <TodayStrip
                    nowMinutes={nowMinutes}
                    empty={t("appointments.emptyToday")}
                    items={todayAppointments.flatMap((item) => {
                      const clip = clipToDayMinutes(
                        new Date(item.startsAt),
                        new Date(item.endsAt),
                        todayIso,
                        booking.timezone,
                      );
                      if (!clip) return [];
                      return [
                        {
                          id: item.id,
                          start: clip.start,
                          end: clip.end,
                          label: item.guestName,
                          href: "/bookings",
                          unpaid: item.status === "pending_payment",
                          past: clip.end <= nowMinutes,
                        },
                      ];
                    })}
                  />
                ) : null}
                {upcomingAppointments.length === 0 &&
                todayAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("appointments.empty")}
                  </p>
                ) : upcomingAppointments.length === 0 ? null : (
                  <ul className="divide-y divide-border">
                    {upcomingAppointments.map((item) => {
                      const day = zonedDateIso(
                        new Date(item.startsAt),
                        booking.timezone,
                      );
                      const isToday = day === todayIso;
                      return (
                        <li key={item.id}>
                          <Link
                            href="/bookings"
                            className="flex items-start justify-between gap-3 py-2 transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-brand">
                                {item.guestName}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {item.serviceTitle ??
                                  t("appointments.unknownService")}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-medium text-brand">
                                {formatTimeInZone(
                                  new Date(item.startsAt),
                                  booking.timezone,
                                  locale,
                                )}
                              </p>
                              <p
                                className={cn(
                                  "text-[11px]",
                                  isToday
                                    ? "font-medium text-action"
                                    : "text-muted-foreground",
                                )}
                              >
                                {isToday
                                  ? t("timing.today")
                                  : formatDisplayDate(day, locale)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Panel>

            <div className="flex min-h-0 flex-col gap-2.5 lg:col-span-3 lg:overflow-hidden">
              <SurfaceCard className="shrink-0 space-y-2 p-3 sm:p-4">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {t("charts.pipeline")}
                </h2>
                <PipelineDonut
                  empty={t("charts.pipelineEmpty")}
                  totalLabel={t("charts.pipelineTotal")}
                  items={openPipeline.map((row) => ({
                    key: row.key,
                    label: tp(`statuses.${row.key as ProjectStatus}`),
                    count: row.count,
                    tone: projectStatusTone(row.key as ProjectStatus),
                  }))}
                />
              </SurfaceCard>

              <Panel
                title={t("expiries.title")}
                href="/people"
                linkLabel={t("expiries.viewPeople")}
                className="lg:min-h-0 lg:flex-1 lg:overflow-hidden"
              >
                {dashboard.statusExpiries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("expiries.empty")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {dashboard.statusExpiries.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="flex items-center justify-between gap-2 py-2 transition-colors hover:bg-muted/40"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-brand">
                              {item.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {ti(item.immigrationStatus)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-xs font-medium",
                              timingClass(item.days),
                            )}
                          >
                            {timingLabel(item.days, t)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
