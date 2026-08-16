import {
  Banknote,
  Briefcase,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FileCheck,
  FileStack,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
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

function greetingKey(hour: number) {
  if (hour < 12) return "greetingMorning" as const;
  if (hour < 17) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

const KIND_TONE: Record<AttentionItem["kind"], StatusPillTone> = {
  overdue: "destructive",
  docs_review: "action",
  questionnaire: "action",
  unpaid: "warning",
  stuck: "warning",
  due_soon: "warning",
};

type KpiAccent = "neutral" | "action" | "warning" | "danger";

const ACCENT_ICON: Record<KpiAccent, string> = {
  neutral: "bg-muted text-muted-foreground",
  action: "bg-action/10 text-action",
  warning: "bg-warning-bg text-warning-text",
  danger: "bg-destructive/10 text-destructive",
};

const ACCENT_VALUE: Record<KpiAccent, string> = {
  neutral: "text-brand",
  action: "text-brand",
  warning: "text-brand",
  danger: "text-destructive",
};

const ACCENT_BAR: Record<KpiAccent, string> = {
  neutral: "bg-border",
  action: "bg-action",
  warning: "bg-warning",
  danger: "bg-destructive",
};

function KpiCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  accent = "neutral",
}: {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  accent?: KpiAccent;
}) {
  const quiet = value === 0 || value === "0";
  const tone = quiet ? "neutral" : accent;

  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-w-0 items-start gap-2.5 overflow-hidden rounded-xl border border-border bg-surface p-2.5 shadow-elevated sm:p-3",
        "transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-action/25 hover:shadow-md",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        quiet && "opacity-70 hover:opacity-100",
      )}
    >
      <span
        className={cn("absolute inset-x-0 top-0 h-0.5", ACCENT_BAR[tone])}
        aria-hidden
      />
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
          ACCENT_ICON[tone],
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "font-heading text-xl leading-none font-semibold tracking-tight tabular-nums",
            quiet ? "text-muted-foreground" : ACCENT_VALUE[tone],
          )}
        >
          {value}
        </p>
        <p className="truncate text-[13px] font-medium text-brand">{label}</p>
        {hint ? (
          <p
            className="truncate text-[11px] leading-snug text-muted-foreground"
            title={hint}
          >
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
  const greet = greetingKey(nowParts.hour);
  const title = displayName
    ? t(greet, { name: displayName })
    : t(`${greet}Fallback`);
  const actionCount =
    kpis.docsToReview +
    kpis.overdueSubmissions +
    kpis.formsReady +
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
  const nextAppointment = upcomingAppointments.find(
    (item) => new Date(item.startsAt) >= now,
  );
  const nextAppointmentTime = nextAppointment
    ? formatTimeInZone(
        new Date(nextAppointment.startsAt),
        booking.timezone,
        locale,
      )
    : null;

  const openPipeline = dashboard.projectsByStatus.filter(
    (row) => !isTerminalStatus(row.key as ProjectStatus),
  );

  const unpaidHint =
    kpis.pendingAmountCents > 0
      ? formatPriceCents(
          kpis.pendingAmountCents,
          locale,
          kpis.pendingCurrency,
        )
      : kpis.pendingPayments > 0
        ? t("tiles.unpaidCount", { count: kpis.pendingPayments })
        : t("tiles.unpaidHint");

  return (
    <div className="flex flex-col gap-2.5 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="font-heading text-xl font-semibold text-brand sm:text-2xl lg:text-xl">
              {title}
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              {formatDateInZone(now, booking.timezone, locale)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span>
              {dashboard.hasCaseload
                ? actionCount > 0
                  ? t("actionSummary", {
                      count: actionCount,
                      bookings: booking.todayCount,
                    })
                  : t("actionSummaryClear", { bookings: booking.todayCount })
                : t("dashboardSubtitle")}
            </span>
            {dashboard.hasCaseload ? (
              <>
                <span aria-hidden>·</span>
                <Link href="/projects" className="hover:text-brand hover:underline">
                  {t("tiles.openFilesCount", { count: kpis.openProjects })}
                </Link>
                <span aria-hidden>·</span>
                <Link href="/people" className="hover:text-brand hover:underline">
                  {t("tiles.peopleCount", { count: kpis.peopleCount })}
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {nextAppointment && nextAppointmentTime ? (
            <Link
              href="/calendar"
              className="hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs shadow-elevated transition-colors hover:border-action/30 lg:inline-flex"
            >
              <CalendarClock className="size-3.5 text-action" aria-hidden />
              <span className="font-medium text-brand">
                {t("appointments.next")}
              </span>
              <span className="max-w-[11rem] truncate text-muted-foreground">
                {nextAppointmentTime} · {nextAppointment.guestName}
              </span>
            </Link>
          ) : null}
          {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
        </div>
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
            className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6"
          >
            <KpiCard
              href="/projects"
              icon={FileCheck}
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              hint={t("tiles.docsToReviewHint")}
              accent={kpis.docsToReview > 0 ? "action" : "neutral"}
            />
            <KpiCard
              href="/projects"
              icon={CircleAlert}
              label={t("tiles.overdue")}
              value={kpis.overdueSubmissions}
              hint={t("dueIn14", { count: kpis.dueIn14Days })}
              accent={kpis.overdueSubmissions > 0 ? "danger" : "neutral"}
            />
            <KpiCard
              href="/projects"
              icon={FileStack}
              label={t("tiles.formsReady")}
              value={kpis.formsReady}
              hint={t("tiles.formsReadyHint")}
              accent={kpis.formsReady > 0 ? "action" : "neutral"}
            />
            <KpiCard
              href="/bookings"
              icon={Banknote}
              label={t("tiles.unpaid")}
              value={kpis.pendingPayments}
              hint={unpaidHint}
              accent={kpis.pendingPayments > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              href="/calendar"
              icon={CalendarClock}
              label={t("tiles.todayBookings")}
              value={booking.todayCount}
              hint={t("tiles.weekBookings", { count: booking.next7Count })}
              accent={booking.todayCount > 0 ? "action" : "neutral"}
            />
            <KpiCard
              href="/people"
              icon={Hourglass}
              label={t("tiles.statusExpiring")}
              value={kpis.statusExpiring30}
              hint={t("tiles.statusExpiringHint")}
              accent={kpis.statusExpiring30 > 0 ? "warning" : "neutral"}
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
                  href="/settings/calendar"
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
                <div className="flex h-full min-h-[6rem] flex-col items-center justify-center gap-2 text-center">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-success-bg text-success-text">
                    <CircleCheck className="size-4" aria-hidden />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {t("attention.empty")}
                  </p>
                </div>
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
                      const isNext = item.id === nextAppointment?.id;
                      return (
                        <li key={item.id}>
                          <Link
                            href="/bookings"
                            className={cn(
                              "flex items-start justify-between gap-3 py-2 transition-colors hover:bg-muted/40",
                              isNext && "-mx-1 rounded-lg bg-action/5 px-1",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-brand">
                                  {item.guestName}
                                </p>
                                {isNext ? (
                                  <StatusPill
                                    label={t("appointments.next")}
                                    tone="action"
                                    className="px-2 py-0 text-[10px]"
                                  />
                                ) : item.status === "pending_payment" ? (
                                  <StatusPill
                                    label={t("appointments.unpaid")}
                                    tone="warning"
                                    className="px-2 py-0 text-[10px]"
                                  />
                                ) : null}
                              </div>
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
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-heading text-sm font-semibold text-brand">
                    {t("charts.pipeline")}
                  </h2>
                  {kpis.stuckWaiting > 0 ? (
                    <StatusPill
                      label={t("stuckWaiting", { count: kpis.stuckWaiting })}
                      tone="warning"
                      className="px-2 py-0 text-[10px]"
                    />
                  ) : null}
                </div>
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
                              "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
                              timingClass(item.days),
                            )}
                          >
                            <Hourglass className="size-3" aria-hidden />
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
