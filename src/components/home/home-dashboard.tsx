import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { HorizontalBarList } from "@/components/home/caseload-charts";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import type { ProgramFamily, ProjectStatus } from "@/db/schema";
import type { HomeDashboard } from "@/lib/crm/dashboard";
import { formatDisplayDate } from "@/lib/crm/dates";
import {
  formatTimeInZone,
  zonedDateIso,
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

type KpiAccent = "none" | "action" | "warning" | "danger";

function KpiCell({
  href,
  label,
  value,
  hint,
  accent = "none",
  groupStart = false,
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
  accent?: KpiAccent;
  /** Visual break between caseload and schedule/people. */
  groupStart?: boolean;
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
        "relative flex min-w-0 flex-col gap-1.5 px-3.5 py-3 transition-colors",
        "hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none",
        groupStart && "xl:border-l-2 xl:border-l-border",
        quiet && "opacity-65 hover:opacity-100",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "font-heading text-[1.65rem] leading-none font-semibold tracking-tight tabular-nums",
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

function KpiStrip({
  items,
  ariaLabel,
}: {
  items: Array<{
    href: string;
    label: string;
    value: number;
    hint?: string;
    accent?: KpiAccent;
    groupStart?: boolean;
  }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="navigation"
      aria-label={ariaLabel}
      className="grid shrink-0 grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0"
    >
      {items.map((item) => (
        <KpiCell key={item.label} {...item} />
      ))}
    </div>
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
      className={cn(
        "flex min-h-0 flex-col gap-2.5 p-3 sm:p-4",
        className,
      )}
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
  const [t, tp, tprog] = await Promise.all([
    getTranslations("appHome"),
    getTranslations("projects"),
    getTranslations("programs"),
  ]);

  const { kpis, booking } = dashboard;
  const todayIso = zonedDateIso(new Date(), booking.timezone);

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h1 className="font-heading text-xl font-semibold text-brand sm:text-2xl lg:text-xl">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            {t("dashboardSubtitle")}
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
          <KpiStrip
            ariaLabel={t("tiles.aria")}
            items={[
              {
                href: "/projects",
                label: t("tiles.openProjects"),
                value: kpis.openProjects,
                hint: t("tiles.openProjectsHint"),
              },
              {
                href: "/projects",
                label: t("tiles.docsToReview"),
                value: kpis.docsToReview,
                hint: t("tiles.docsToReviewHint"),
                accent: kpis.docsToReview > 0 ? "action" : "none",
              },
              {
                href: "/projects",
                label: t("tiles.overdue"),
                value: kpis.overdueSubmissions,
                hint: t("dueIn14", { count: kpis.dueIn14Days }),
                accent: kpis.overdueSubmissions > 0 ? "danger" : "none",
              },
              {
                href: "/projects",
                label: t("tiles.stuck"),
                value: kpis.stuckWaiting,
                hint: t("tiles.stuckHint"),
                accent: kpis.stuckWaiting > 0 ? "warning" : "none",
              },
              {
                href: "/calendar",
                label: t("tiles.todayBookings"),
                value: booking.todayCount,
                hint: t("tiles.weekBookings", { count: booking.next7Count }),
                accent: booking.todayCount > 0 ? "action" : "none",
                groupStart: true,
              },
              {
                href: "/people",
                label: t("tiles.statusExpiring"),
                value: kpis.statusExpiring30,
                hint: t("tiles.peopleCount", { count: kpis.peopleCount }),
                accent: kpis.statusExpiring30 > 0 ? "warning" : "none",
              },
            ]}
          />

          {booking.needsSetup ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-warning-bg px-3 py-2 text-sm text-warning-text">
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

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-12 lg:overflow-hidden">
            <Panel
              title={t("upcoming.title")}
              href="/projects"
              linkLabel={t("viewAllProjects")}
              className="lg:col-span-5 lg:overflow-hidden"
            >
              {dashboard.upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("upcoming.empty")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {dashboard.upcoming.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-start justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <p className="truncate text-sm font-medium text-brand">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {tp(`statuses.${item.status}`)}
                          </p>
                          <div className="flex gap-3">
                            <ProgressMeter
                              compact
                              valueLabel={t("upcoming.docs", {
                                done: item.docsDone,
                                total: item.docsTotal,
                              })}
                              percent={docsPercent(item.docsDone, item.docsTotal)}
                            />
                            <ProgressMeter
                              compact
                              valueLabel={t("upcoming.forms", {
                                percent: item.formPercent,
                              })}
                              percent={item.formPercent}
                            />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              timingClass(item.days),
                            )}
                          >
                            {timingLabel(item.days, t)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatDisplayDate(item.submitBefore, locale)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title={t("appointments.title")}
              href="/calendar"
              linkLabel={t("appointments.viewCalendar")}
              className="lg:col-span-4 lg:overflow-hidden"
            >
              {dashboard.appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("appointments.empty")}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {dashboard.appointments.map((item) => {
                    const day = zonedDateIso(
                      new Date(item.startsAt),
                      booking.timezone,
                    );
                    const isToday = day === todayIso;
                    return (
                      <li key={item.id}>
                        <Link
                          href="/calendar"
                          className="flex items-start justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
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
            </Panel>

            <div className="flex min-h-0 flex-col gap-3 lg:col-span-3 lg:overflow-hidden">
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
                          <span className="min-w-0 truncate text-sm font-medium text-brand">
                            {item.name}
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

              <SurfaceCard className="shrink-0 space-y-2 p-3 sm:p-4">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {t("charts.projectsByStatus")}
                </h2>
                <HorizontalBarList
                  empty={t("charts.projectsByStatusEmpty")}
                  items={dashboard.projectsByStatus.map((row) => ({
                    key: row.key,
                    label: tp(`statuses.${row.key as ProjectStatus}`),
                    count: row.count,
                  }))}
                />
                {dashboard.peopleByVisa.length > 0 ? (
                  <>
                    <h2 className="font-heading pt-1 text-sm font-semibold text-brand">
                      {t("charts.peopleByVisa")}
                    </h2>
                    <HorizontalBarList
                      empty={t("charts.peopleByVisaEmpty")}
                      items={dashboard.peopleByVisa.slice(0, 4).map((row) => ({
                        key: row.key,
                        label: tprog(row.key as ProgramFamily),
                        count: row.count,
                      }))}
                    />
                  </>
                ) : null}
              </SurfaceCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
