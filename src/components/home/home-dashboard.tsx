import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileWarning,
  FolderKanban,
  Users,
} from "lucide-react";
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

function ActionTile({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
  icon: typeof FolderKanban;
  tone?: "neutral" | "warning" | "danger" | "action";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning-text"
        : tone === "action"
          ? "text-action"
          : "text-brand";

  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated transition-colors hover:border-action/40 hover:bg-action/5"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn("font-heading text-2xl font-semibold tabular-nums", toneClass)}>
        {value}
      </span>
      {hint ? (
        <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
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
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <ActionTile
              href="/projects"
              icon={FolderKanban}
              label={t("tiles.openProjects")}
              value={kpis.openProjects}
              hint={t("tiles.openProjectsHint")}
            />
            <ActionTile
              href="/projects"
              icon={ClipboardList}
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              tone={kpis.docsToReview > 0 ? "action" : "neutral"}
              hint={t("tiles.docsToReviewHint")}
            />
            <ActionTile
              href="/projects"
              icon={FileWarning}
              label={t("tiles.overdue")}
              value={kpis.overdueSubmissions}
              tone={kpis.overdueSubmissions > 0 ? "danger" : "neutral"}
              hint={t("dueIn14", { count: kpis.dueIn14Days })}
            />
            <ActionTile
              href="/projects"
              icon={AlertTriangle}
              label={t("tiles.stuck")}
              value={kpis.stuckWaiting}
              tone={kpis.stuckWaiting > 0 ? "warning" : "neutral"}
              hint={t("tiles.stuckHint")}
            />
            <ActionTile
              href="/calendar"
              icon={CalendarDays}
              label={t("tiles.todayBookings")}
              value={booking.todayCount}
              tone={booking.todayCount > 0 ? "action" : "neutral"}
              hint={t("tiles.weekBookings", { count: booking.next7Count })}
            />
            <ActionTile
              href="/people"
              icon={Users}
              label={t("tiles.statusExpiring")}
              value={kpis.statusExpiring30}
              tone={kpis.statusExpiring30 > 0 ? "warning" : "neutral"}
              hint={t("tiles.peopleCount", { count: kpis.peopleCount })}
            />
          </div>

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
