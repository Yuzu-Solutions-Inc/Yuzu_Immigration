import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AttentionList } from "@/components/home/attention-list";
import { CaseloadBar } from "@/components/home/caseload-bar";
import { SetupChecklist } from "@/components/home/setup-checklist";
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

const snapshotTileClass = cn(
  "flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5",
  "bg-muted/60 transition-colors",
  "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
);

function SnapshotMetric({
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
  const callout = emphasize && !quiet;

  return (
    <Link
      href={href}
      className={cn(
        snapshotTileClass,
        callout && "bg-action/10 hover:bg-action/15",
        className,
      )}
    >
      <p
        className={cn(
          "font-heading text-2xl leading-none font-semibold tracking-tight tabular-nums",
          quiet ? "text-muted-foreground" : callout ? "text-action" : "text-brand",
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
            callout ? "text-action" : "text-brand",
          )}
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
  const caseloadTotal =
    kpis.openProjects + kpis.readyToSubmit + kpis.submittedProjects;

  const unpaidHint =
    kpis.pendingAmountCents > 0
      ? formatPriceCents(
          kpis.pendingAmountCents,
          locale,
          kpis.pendingCurrency,
        )
      : undefined;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        dashboard.hasCaseload
          ? "lg:h-[calc(100dvh-5rem)] lg:overflow-hidden"
          : "lg:overflow-y-auto",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-semibold tracking-tight text-brand">
            {title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {formatDateInZone(now, booking.timezone, locale)}
          </p>
        </div>
        {canCreate ? <NewProjectButton label={t("newProject")} /> : null}
      </div>

      <SetupChecklist setup={dashboard.setup} />

      {booking.needsSetup ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border-l-2 border-l-action bg-action/5 px-3 py-2 text-sm text-brand">
          <span className="inline-flex items-center gap-2">
            <Briefcase className="size-4 shrink-0 text-action" aria-hidden />
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
              href="/settings/account#hours"
              className="font-medium text-action underline-offset-2 hover:underline"
            >
              {t("bookingSetup.hours")}
            </Link>
          </span>
        </div>
      ) : null}

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
            className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-12"
          >
            <Link
              href="/projects"
              className={cn(
                snapshotTileClass,
                "col-span-2 gap-2 lg:col-span-6",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    "font-heading text-2xl leading-none font-semibold tracking-tight tabular-nums",
                    caseloadTotal === 0 ? "text-muted-foreground" : "text-brand",
                  )}
                >
                  {caseloadTotal}
                </p>
                <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {t("caseload.title")}
                </p>
              </div>
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
            <SnapshotMetric
              href="/projects"
              className="lg:col-span-3"
              label={t("tiles.docsToReview")}
              value={kpis.docsToReview}
              emphasize={kpis.docsToReview > 0}
            />
            <SnapshotMetric
              href="/bookings?payment=pending"
              className="lg:col-span-3"
              label={t("tiles.unpaid")}
              value={kpis.pendingPayments}
              hint={unpaidHint}
              emphasize={kpis.pendingPayments > 0}
            />
          </div>

          <div className="grid min-h-0 min-w-0 items-stretch gap-4 lg:grid-cols-12 lg:flex-1 lg:overflow-hidden">
            <SurfaceCard className="flex max-h-[min(24rem,55dvh)] min-h-0 min-w-0 flex-col overflow-hidden p-4 sm:p-5 lg:col-span-5 lg:max-h-none">
              <AttentionList rows={dashboard.attention} locale={locale} />
            </SurfaceCard>

            <SurfaceCard className="flex max-h-[min(32rem,70dvh)] min-h-0 min-w-0 flex-col overflow-hidden p-4 sm:p-5 lg:col-span-7 lg:max-h-none">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="font-heading text-base font-semibold text-brand">
                    {t("timing.today")}
                  </h2>
                  <span
                    className={cn(
                      "tabular-nums text-sm font-semibold",
                      booking.todayCount > 0
                        ? "text-action"
                        : "text-muted-foreground",
                    )}
                    aria-label={t("appointments.todayCount", {
                      count: booking.todayCount,
                    })}
                  >
                    {booking.todayCount}
                  </span>
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
                  <p className="pt-3 text-sm text-muted-foreground">
                    {t("appointments.empty")}
                  </p>
                ) : (
                  <div className="flex min-w-0 flex-col gap-6 pt-3">
                    <section className="min-w-0">
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
                        <h3 className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          <span>{t("appointments.laterHeading")}</span>
                          <span className="tabular-nums font-medium normal-case">
                            {t("appointments.weekCount", {
                              count: booking.next7Count,
                            })}
                          </span>
                        </h3>
                        <ul className="min-w-0">
                          {laterByDay.map((group) => (
                            <li key={group.day} className="min-w-0 pt-3">
                              <p className="pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                {formatWeekdayDate(group.day, locale)}
                              </p>
                              <ul className="min-w-0 divide-y divide-border/70">
                                {group.items.map((item) => {
                                  const joinUrl = meetingJoinUrl({
                                    url: item.meetJoinUrl,
                                    startsAt: item.startsAt,
                                    endsAt: item.endsAt,
                                    status: item.status,
                                  });
                                  return (
                                    <li key={item.id} className="min-w-0">
                                      <div className="flex min-w-0 items-center gap-3 py-2">
                                        <p className="w-[4.5rem] shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">
                                          {formatTimeInZone(
                                            new Date(item.startsAt),
                                            booking.timezone,
                                            locale,
                                          )}
                                        </p>
                                        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                          <Link
                                            href="/bookings"
                                            className="min-w-0 flex-1 rounded-md px-1 hover:bg-muted"
                                          >
                                            <p className="truncate text-sm font-medium text-brand">
                                              {item.guestName}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
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
