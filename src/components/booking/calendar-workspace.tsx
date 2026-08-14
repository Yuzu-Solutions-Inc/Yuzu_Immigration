"use client";

import { Ban, CalendarDays, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  blockDayAction,
  cancelAppointmentAction,
  unblockTimeAction,
} from "@/app/actions/booking";
import { AppointmentDetailCard } from "@/components/booking/appointment-detail-card";
import { CopyBookingLinkButton } from "@/components/booking/copy-booking-link-button";
import { DayTimeline } from "@/components/booking/day-timeline";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { Button, buttonVariants } from "@/components/ui/button";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { mergeMinuteRanges } from "@/lib/booking/availability";
import type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingServiceFormFieldRow,
  BookingSettingsRow,
} from "@/lib/booking/types";
import {
  addDaysToIsoDate,
  clipToDayMinutes,
  coversCivilDay,
  formatDateInZone,
  minutesFromHm,
  weekdayFromIsoDate,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

export function CalendarWorkspace({
  locale,
  canManage,
  settings,
  rules,
  appointments,
  blocked,
  googleBusy,
  formFields,
  hostNames,
  fillViewport = true,
}: {
  locale: string;
  canManage: boolean;
  settings: BookingSettingsRow | null;
  rules: BookingAvailabilityRuleRow[];
  appointments: BookingAppointmentRow[];
  blocked: BookingBlockedTimeRow[];
  googleBusy: BookingGoogleBusyRow[];
  formFields: BookingServiceFormFieldRow[];
  hostNames: Record<string, string>;
  /** Pin the workspace to one desktop viewport (minus main padding). */
  fillViewport?: boolean;
}) {
  const t = useTranslations("calendar");
  const timeZone = settings?.timezone ?? "America/Toronto";
  const todayIso = zonedDateIso(new Date(), timeZone);
  const [cursor, setCursor] = useState(() => {
    const parts = todayIso.split("-").map(Number);
    return { year: parts[0], monthIndex: parts[1] - 1 };
  });
  const [selectedDateIso, setSelectedDateIso] = useState(todayIso);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedAppointmentId(null);
  }, [selectedDateIso]);

  const markers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of appointments) {
      if (row.status === "cancelled") continue;
      const dateIso = zonedDateIso(new Date(row.starts_at), timeZone);
      counts[dateIso] = (counts[dateIso] ?? 0) + 1;
    }
    return counts;
  }, [appointments, timeZone]);

  const blockedDays = useMemo(() => {
    const days = new Set<string>();
    for (const row of blocked) {
      const start = zonedDateIso(new Date(row.starts_at), timeZone);
      const endInclusive = zonedDateIso(
        new Date(new Date(row.ends_at).getTime() - 1),
        timeZone,
      );
      let current = start;
      while (current <= endInclusive) {
        if (
          coversCivilDay(
            new Date(row.starts_at),
            new Date(row.ends_at),
            current,
            timeZone,
          )
        ) {
          days.add(current);
        }
        current = addDaysToIsoDate(current, 1);
      }
    }
    return days;
  }, [blocked, timeZone]);

  const dayAppointments = appointments.filter((row) => {
    return (
      clipToDayMinutes(
        new Date(row.starts_at),
        new Date(row.ends_at),
        selectedDateIso,
        timeZone,
      ) !== null
    );
  });

  const dayBlocks = blocked.filter((row) => {
    return (
      clipToDayMinutes(
        new Date(row.starts_at),
        new Date(row.ends_at),
        selectedDateIso,
        timeZone,
      ) !== null
    );
  });

  const dayGoogleBusy = googleBusy.filter((row) => {
    return (
      clipToDayMinutes(
        new Date(row.starts_at),
        new Date(row.ends_at),
        selectedDateIso,
        timeZone,
      ) !== null
    );
  });

  const fullDayBlock = dayBlocks.find((row) =>
    coversCivilDay(
      new Date(row.starts_at),
      new Date(row.ends_at),
      selectedDateIso,
      timeZone,
    ),
  );

  const selectedAppointment =
    dayAppointments.find((row) => row.id === selectedAppointmentId) ?? null;

  const openRanges = useMemo(() => {
    const weekday = weekdayFromIsoDate(selectedDateIso);
    return mergeMinuteRanges(
      rules
        .filter((rule) => rule.weekday === weekday)
        .map((rule) => ({
          start: minutesFromHm(rule.start_time),
          end: minutesFromHm(rule.end_time),
        })),
    );
  }, [rules, selectedDateIso]);

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const date = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
    });
  }

  const selectedNoon = zonedCivilToUtc(selectedDateIso, "12:00", timeZone);

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        fillViewport
          ? "lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden lg:gap-3"
          : "h-full min-h-0 lg:overflow-hidden lg:gap-3",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand lg:text-xl">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground lg:text-sm">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyBookingLinkButton locale={locale} />
          <Link
            href="/calendar/settings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 className="size-4" />
            {t("settings")}
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,1fr)] lg:gap-4 lg:overflow-hidden">
        <SurfaceCard className="min-h-0 p-4 sm:p-5 lg:flex lg:flex-col lg:overflow-hidden">
          <MonthCalendar
            year={cursor.year}
            monthIndex={cursor.monthIndex}
            locale={locale}
            timeZone={timeZone}
            selectedDateIso={selectedDateIso}
            onSelectDate={setSelectedDateIso}
            onPrevMonth={() => shiftMonth(-1)}
            onNextMonth={() => shiftMonth(1)}
            markers={markers}
            blockedDays={blockedDays}
            fillHeight
          />
        </SurfaceCard>

        <SurfaceCard className="flex min-h-0 flex-col gap-3 p-4 sm:p-5 lg:overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("dayDetail")}
              </p>
              <h2 className="font-heading text-lg font-semibold text-brand">
                {formatDateInZone(selectedNoon, timeZone, locale)}
              </h2>
            </div>
            {canManage ? (
              fullDayBlock ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await unblockTimeAction(
                        fullDayBlock.id,
                        locale,
                      );
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else toast.success(t("dayUnblocked"));
                    });
                  }}
                >
                  {t("unblockDay")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await blockDayAction(
                        selectedDateIso,
                        locale,
                      );
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else toast.success(t("dayBlocked"));
                    });
                  }}
                >
                  <Ban className="size-4" />
                  {t("blockDay")}
                </Button>
              )
            ) : null}
          </div>

          {fullDayBlock ? (
            <p className="shrink-0 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("dayIsBlocked")}
            </p>
          ) : null}

          <DayTimeline
            locale={locale}
            canManage={canManage}
            dateIso={selectedDateIso}
            timeZone={timeZone}
            appointments={dayAppointments}
            blocked={dayBlocks}
            googleBusy={dayGoogleBusy}
            openRanges={openRanges}
            selectedAppointmentId={selectedAppointmentId}
            onSelectAppointment={setSelectedAppointmentId}
            className="min-h-[22rem] lg:min-h-0"
          />

          <div className="shrink-0">
            {selectedAppointment ? (
              <AppointmentDetailCard
                locale={locale}
                canManage={canManage}
                pending={pending}
                timeZone={timeZone}
                row={selectedAppointment}
                formFields={formFields}
                hostNames={hostNames}
                onCancel={(id) => {
                  startTransition(async () => {
                    const result = await cancelAppointmentAction(id, locale);
                    if (result.error) {
                      toast.error(t(`errors.${result.error}`));
                    } else {
                      toast.success(t("cancelled"));
                      setSelectedAppointmentId(null);
                    }
                  });
                }}
                onRescheduled={(dateIso) => {
                  setSelectedDateIso(dateIso);
                }}
              />
            ) : dayAppointments.filter((row) => row.status !== "cancelled")
                .length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noAppointments")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("selectBookingHint")}
              </p>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

export function CalendarEmptyHint({
  hasServices,
}: {
  hasServices: boolean;
}) {
  const t = useTranslations("calendar");
  return (
    <SurfaceCard className="flex items-start gap-3">
      <CalendarDays className="mt-0.5 size-5 text-action" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-brand">{t("gettingStarted")}</p>
        <p className="text-sm text-muted-foreground">
          {hasServices ? t("setupHint") : t("needServices")}
        </p>
        {!hasServices ? (
          <Link
            href="/services"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("goServices")}
          </Link>
        ) : (
          <Link
            href="/calendar/settings"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("settings")}
          </Link>
        )}
      </div>
    </SurfaceCard>
  );
}
