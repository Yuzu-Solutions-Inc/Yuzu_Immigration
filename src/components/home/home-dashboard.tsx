import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AttentionList } from "@/components/home/attention-list";
import { CaseloadBar } from "@/components/home/caseload-bar";
import { TodayStrip } from "@/components/home/caseload-charts";
import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import type { HomeDashboard } from "@/lib/crm/dashboard";
import { formatDisplayDate } from "@/lib/crm/dates";
import { formatPriceCents } from "@/lib/booking/slots";
import {
  clipToDayMinutes,
  formatDateInZone,
  formatTimeInZone,
  zonedDateIso,
  zonedParts,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

function greetingKey(hour: number) {
  if (hour < 12) return "greetingMorning" as const;
  if (hour < 17) return "greetingAfternoon" as const;
  return "greetingEvening" as const;
}

function timingLabel(
  days: number,
  t: Awaited<ReturnType<typeof getTranslations<"appHome">>>,
) {
  if (days < 0) return t("timing.overdue", { days: Math.abs(days) });
  if (days === 0) return t("timing.today");
  return t("timing.inDays", { days });
}

function KpiCard({
  href,
  label,
  value,
  hint,
  emphasize = false,
  className,
}: {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
  emphasize?: boolean;
  className?: string;
}) {
  const quiet = value === 0 || value === "0";

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface p-3 shadow-elevated",
        "transition-[border-color,box-shadow] hover:border-action/25 hover:shadow-md",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        className,
      )}
    >
      <p
        className={cn(
          "font-heading text-xl leading-none font-semibold tracking-tight tabular-nums",
          quiet
            ? "text-muted-foreground"
            : emphasize
              ? "text-action"
              : "text-brand",
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
    </Link>
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
  const [t, ti] = await Promise.all([
    getTranslations("appHome"),
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
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-5.5rem)] lg:min-h-0 lg:overflow-hidden">
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
          <p className="text-sm text-muted-foreground">
            {dashboard.hasCaseload
              ? dashboard.attention.length > 0
                ? t("actionSummary", {
                    count: dashboard.attention.length,
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
            className="grid shrink-0 grid-cols-3 gap-2.5 lg:grid-cols-12"
          >
            <Link
              href="/projects"
              className={cn(
                "col-span-3 flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated lg:col-span-6",
                "transition-[border-color,box-shadow] hover:border-action/25 hover:shadow-md",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
              )}
            >
              <p className="font-heading text-sm font-semibold text-brand">
                {t("caseload.title")}
              </p>
              <CaseloadBar
                open={kpis.openProjects}
                ready={kpis.readyToSubmit}
                submitted={kpis.submittedProjects}
                empty={t("caseload.empty")}
                labels={{
                  open: t("caseload.open"),
                  ready: t("caseload.ready"),
                  submitted: t("caseload.submitted"),
                }}
              />
            </Link>
            <KpiCard
              href="/projects"
              className="lg:col-span-2"
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              hint={t("tiles.docsToReviewHint")}
              emphasize={kpis.docsToReview > 0}
            />
            <KpiCard
              href="/bookings"
              className="lg:col-span-2"
              label={t("tiles.unpaid")}
              value={kpis.pendingPayments}
              hint={unpaidHint}
              emphasize={kpis.pendingPayments > 0}
            />
            <KpiCard
              href="/calendar"
              className="lg:col-span-2"
              label={t("tiles.todayBookings")}
              value={booking.todayCount}
              hint={t("tiles.weekBookings", { count: booking.next7Count })}
            />
          </div>

          {booking.needsSetup ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Briefcase className="size-4 shrink-0" aria-hidden />
                {t("bookingSetup.banner")}
              </span>
              <span className="flex flex-wrap gap-3">
                <Link
                  href="/services"
                  className="font-medium text-action underline-offset-2 hover:underline"
                >
                  {t("bookingSetup.services")}
                </Link>
                <Link
                  href="/settings/calendar"
                  className="font-medium text-action underline-offset-2 hover:underline"
                >
                  {t("bookingSetup.hours")}
                </Link>
              </span>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-2.5 lg:grid-cols-12 lg:overflow-hidden">
            <SurfaceCard className="flex min-h-0 flex-col p-3 sm:p-4 lg:col-span-5 lg:overflow-hidden">
              <AttentionList rows={dashboard.attention} locale={locale} />
            </SurfaceCard>

            <SurfaceCard className="flex min-h-0 flex-col gap-2.5 p-3 sm:p-4 lg:col-span-4 lg:overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {t("appointments.title")}
                </h2>
                <Link
                  href="/calendar"
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  {t("appointments.viewCalendar")}
                </Link>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
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
                              className="flex items-start justify-between gap-3 py-2 transition-colors hover:bg-muted/40"
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
              </div>
            </SurfaceCard>

            <SurfaceCard className="flex min-h-0 flex-col gap-2.5 p-3 sm:p-4 lg:col-span-3 lg:overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h2 className="font-heading text-sm font-semibold text-brand">
                  {t("expiries.title")}
                </h2>
                <Link
                  href="/people"
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  {t("expiries.viewPeople")}
                </Link>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
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
                              item.days < 0
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {timingLabel(item.days, t)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
