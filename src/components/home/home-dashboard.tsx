import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AttentionList } from "@/components/home/attention-list";
import { CaseloadBar } from "@/components/home/caseload-bar";
import { TodayTimeline } from "@/components/home/today-timeline";
import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import type { DashboardAppointment, HomeDashboard } from "@/lib/crm/dashboard";
import { meetingJoinUrl } from "@/lib/booking/join-window";
import { formatPriceCents } from "@/lib/booking/slots";
import {
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

function formatWeekdayDate(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { weekday: "short", month: "short", day: "numeric" },
  );
}

function groupByDay(
  items: DashboardAppointment[],
  timezone: string,
) {
  const groups: { day: string; items: DashboardAppointment[] }[] = [];
  for (const item of items) {
    const day = zonedDateIso(new Date(item.startsAt), timezone);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

function appointmentDurationMinutes(item: DashboardAppointment) {
  return Math.max(
    1,
    Math.round(
      (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) /
        60_000,
    ),
  );
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
  const t = await getTranslations("appHome");

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
  const laterByDay = groupByDay(laterAppointments, booking.timezone);
  const joinLabel = t("appointments.joinNow");

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
    <div className="flex min-w-0 flex-col gap-3 lg:h-[calc(100dvh-5rem)] lg:overflow-hidden">
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
            className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-12"
          >
            <Link
              href="/projects"
              className={cn(
                "col-span-2 flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated lg:col-span-6",
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
              className="lg:col-span-3"
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              hint={t("tiles.docsToReviewHint")}
              emphasize={kpis.docsToReview > 0}
            />
            <KpiCard
              href="/bookings"
              className="lg:col-span-3"
              label={t("tiles.unpaid")}
              value={kpis.pendingPayments}
              hint={unpaidHint}
              emphasize={kpis.pendingPayments > 0}
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

          <div className="grid min-h-0 min-w-0 items-stretch gap-2.5 lg:grid-cols-12 lg:flex-1 lg:overflow-hidden">
            <SurfaceCard className="flex max-h-[min(24rem,55dvh)] min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-4 lg:col-span-5 lg:max-h-none">
              <AttentionList rows={dashboard.attention} locale={locale} />
            </SurfaceCard>

            <SurfaceCard className="flex max-h-[min(32rem,70dvh)] min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-4 lg:col-span-7 lg:max-h-none">
              <div className="flex shrink-0 items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-heading text-sm font-semibold text-brand">
                    {t("appointments.title")}
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("appointments.todayCount", {
                      count: booking.todayCount,
                    })}
                    {" · "}
                    {t("appointments.weekCount", {
                      count: booking.next7Count,
                    })}
                  </p>
                </div>
                <Link
                  href="/calendar"
                  className="shrink-0 text-xs font-medium text-action hover:underline"
                >
                  {t("appointments.viewCalendar")}
                </Link>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                {todayAppointments.length === 0 &&
                laterAppointments.length === 0 ? (
                  <p className="pt-2.5 text-sm text-muted-foreground">
                    {t("appointments.empty")}
                  </p>
                ) : (
                  <div className="flex min-w-0 flex-col gap-5 pt-3">
                    <section className="min-w-0">
                      <h3 className="pb-1.5 text-xs font-semibold text-brand">
                        {t("timing.today")}
                      </h3>
                      <TodayTimeline
                        nowMinutes={nowMinutes}
                        nowLabel={t("appointments.now")}
                        empty={t("appointments.emptyToday")}
                        unpaidLabel={t("appointments.unpaid")}
                        durationLabel={(minutes) =>
                          t("appointments.durationMinutes", { minutes })
                        }
                        items={todayAppointments.map((item) => {
                          const start = new Date(item.startsAt);
                          const parts = zonedParts(start, booking.timezone);
                          const joinUrl = meetingJoinUrl({
                            url: item.meetJoinUrl,
                            startsAt: item.startsAt,
                            endsAt: item.endsAt,
                            status: item.status,
                          });
                          return {
                            id: item.id,
                            startLabel: formatTimeInZone(
                              start,
                              booking.timezone,
                              locale,
                            ),
                            endLabel: formatTimeInZone(
                              new Date(item.endsAt),
                              booking.timezone,
                              locale,
                            ),
                            startMinutes: parts.hour * 60 + parts.minute,
                            durationMinutes: appointmentDurationMinutes(item),
                            label: item.guestName,
                            service:
                              item.serviceTitle ??
                              t("appointments.unknownService"),
                            href: "/bookings",
                            joinUrl,
                            joinLabel,
                            unpaid: item.status === "pending_payment",
                            past: new Date(item.endsAt) <= now,
                          };
                        })}
                      />
                    </section>
                    {laterByDay.length > 0 ? (
                      <section className="min-w-0">
                        <h3 className="border-b border-border/70 pb-1 text-[11px] font-medium text-muted-foreground">
                          {t("appointments.laterHeading")}
                        </h3>
                        <ul className="min-w-0">
                          {laterByDay.map((group) => (
                            <li key={group.day} className="min-w-0 pt-2.5">
                              <p className="pb-1 text-xs font-medium text-muted-foreground">
                                {formatWeekdayDate(group.day, locale)}
                              </p>
                              <ul className="min-w-0">
                                {group.items.map((item) => {
                                  const joinUrl = meetingJoinUrl({
                                    url: item.meetJoinUrl,
                                    startsAt: item.startsAt,
                                    endsAt: item.endsAt,
                                    status: item.status,
                                  });
                                  return (
                                    <li key={item.id} className="min-w-0">
                                      <div className="flex min-w-0 items-start gap-3 py-1.5">
                                        <p className="w-[5.25rem] shrink-0 pt-0.5 text-right text-[13px] font-semibold text-brand tabular-nums">
                                          {formatTimeInZone(
                                            new Date(item.startsAt),
                                            booking.timezone,
                                            locale,
                                          )}
                                        </p>
                                        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                                          <Link
                                            href="/bookings"
                                            className="min-w-0 flex-1 rounded-md hover:bg-muted/40"
                                          >
                                            <p className="truncate text-sm font-semibold text-brand">
                                              {item.guestName}
                                            </p>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                              {item.serviceTitle ??
                                                t("appointments.unknownService")}
                                              {" · "}
                                              {t(
                                                "appointments.durationMinutes",
                                                {
                                                  minutes:
                                                    appointmentDurationMinutes(
                                                      item,
                                                    ),
                                                },
                                              )}
                                            </p>
                                          </Link>
                                          {joinUrl ? (
                                            <a
                                              href={joinUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="shrink-0 text-xs font-semibold text-action hover:underline"
                                            >
                                              {joinLabel}
                                            </a>
                                          ) : null}
                                        </div>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                )}
              </div>
            </SurfaceCard>
          </div>
        </>
      )}
    </div>
  );
}
