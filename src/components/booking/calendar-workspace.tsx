"use client";

import { Ban, CalendarDays, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { mergeMinuteRanges, listCivilDaysWithOpenCapacity } from "@/lib/booking/availability";
import type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingMicrosoftBusyRow,
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

type MobilePane = "month" | "day";

export function CalendarWorkspace({
  locale,
  canManage,
  currentUserId,
  settings,
  rules,
  appointments,
  blocked,
  googleBusy,
  microsoftBusy,
  formFields,
  hostNames,
  fillViewport = true,
}: {
  locale: string;
  canManage: boolean;
  currentUserId: string;
  settings: BookingSettingsRow | null;
  rules: BookingAvailabilityRuleRow[];
  appointments: BookingAppointmentRow[];
  blocked: BookingBlockedTimeRow[];
  googleBusy: BookingGoogleBusyRow[];
  microsoftBusy: BookingMicrosoftBusyRow[];
  formFields: BookingServiceFormFieldRow[];
  hostNames: Record<string, string>;
  /** Pin the workspace to one viewport (minus chrome). */
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
  const [mobilePane, setMobilePane] = useState<MobilePane>("day");
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

  const openDays = useMemo(() => {
    const hostBusy = [
      ...googleBusy.map((row) => ({
        starts_at: row.starts_at,
        ends_at: row.ends_at,
      })),
      ...microsoftBusy.map((row) => ({
        starts_at: row.starts_at,
        ends_at: row.ends_at,
      })),
      ...appointments
        .filter(
          (row) =>
            row.host_user_id === currentUserId && row.status !== "cancelled",
        )
        .map((row) => ({
          starts_at: row.starts_at,
          ends_at: row.ends_at,
        })),
    ];
    return listCivilDaysWithOpenCapacity({
      timeZone,
      todayIso,
      windowDays: settings?.booking_window_days ?? 60,
      minNoticeHours: settings?.min_notice_hours ?? 0,
      bufferMinutes: settings?.buffer_minutes ?? 0,
      rules,
      blocked,
      busy: hostBusy,
      fullyBlockedDays: blockedDays,
    });
  }, [
    appointments,
    blocked,
    blockedDays,
    currentUserId,
    googleBusy,
    microsoftBusy,
    rules,
    settings?.booking_window_days,
    settings?.buffer_minutes,
    settings?.min_notice_hours,
    timeZone,
    todayIso,
  ]);

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
  const dayMicrosoftBusy = microsoftBusy.filter((row) => {
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

  function shiftDay(delta: number) {
    const next = addDaysToIsoDate(selectedDateIso, delta);
    setSelectedDateIso(next);
    const [y, m] = next.split("-").map(Number);
    setCursor({ year: y, monthIndex: m - 1 });
  }

  function selectDate(dateIso: string, options?: { openDay?: boolean }) {
    setSelectedDateIso(dateIso);
    const [y, m] = dateIso.split("-").map(Number);
    setCursor({ year: y, monthIndex: m - 1 });
    if (options?.openDay) setMobilePane("day");
  }

  const selectedNoon = zonedCivilToUtc(selectedDateIso, "12:00", timeZone);

  const dayHeader = (
    <div className="flex shrink-0 items-start justify-between gap-2 sm:gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("dayDetail")}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => shiftDay(-1)}
            aria-label={t("prevDay")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="font-heading min-w-0 truncate text-base font-semibold text-brand sm:text-lg">
            {formatDateInZone(selectedNoon, timeZone, locale)}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => shiftDay(1)}
            aria-label={t("nextDay")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {canManage ? (
        fullDayBlock ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
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
            className="shrink-0"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await blockDayAction(selectedDateIso, locale);
                if (result.error) toast.error(t(`errors.${result.error}`));
                else toast.success(t("dayBlocked"));
              });
            }}
          >
            <Ban className="size-4" />
            <span className="hidden sm:inline">{t("blockDay")}</span>
          </Button>
        )
      ) : null}
    </div>
  );

  const dayBody = (
    <>
      {fullDayBlock ? (
        <p className="shrink-0 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text">
          {dayAppointments.filter((row) => row.status !== "cancelled").length >
          0
            ? t("dayIsBlockedWithBookings")
            : t("dayIsBlocked")}
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
        microsoftBusy={dayMicrosoftBusy}
        openRanges={openRanges}
        selectedAppointmentId={selectedAppointmentId}
        onSelectAppointment={setSelectedAppointmentId}
        className="min-h-[18rem] flex-1 lg:min-h-0"
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
              selectDate(dateIso);
            }}
          />
        ) : dayAppointments.filter((row) => row.status !== "cancelled")
            .length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAppointments")}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("selectBookingHint")}
          </p>
        )}
      </div>
    </>
  );

  const monthCalendar = (
    <MonthCalendar
      year={cursor.year}
      monthIndex={cursor.monthIndex}
      locale={locale}
      timeZone={timeZone}
      selectedDateIso={selectedDateIso}
      onSelectDate={(dateIso) => selectDate(dateIso, { openDay: true })}
      onPrevMonth={() => shiftMonth(-1)}
      onNextMonth={() => shiftMonth(1)}
      markers={markers}
      openDays={openDays}
      blockedDays={blockedDays}
      fillHeight
      compact
    />
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:gap-4",
        fillViewport
          ? "h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden sm:h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)] lg:gap-3"
          : "min-h-0 lg:h-full lg:overflow-hidden lg:gap-3",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 className="font-heading text-xl font-semibold text-brand sm:text-2xl lg:text-xl">
            {t("title")}
          </h1>
          <p className="hidden text-[15px] text-muted-foreground sm:block lg:text-sm">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyBookingLinkButton locale={locale} />
          <Link
            href="/settings/calendar"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">{t("settings")}</span>
          </Link>
        </div>
      </div>

      {/* Mobile / tablet: one pane at a time */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:hidden">
        <Tabs
          value={mobilePane}
          onValueChange={(value) => {
            if (value === "month" || value === "day") setMobilePane(value);
          }}
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <TabsList className="grid h-9 w-full shrink-0 grid-cols-2">
            <TabsTrigger value="month">{t("viewMonth")}</TabsTrigger>
            <TabsTrigger value="day">{t("viewDay")}</TabsTrigger>
          </TabsList>

          {mobilePane === "month" ? (
            <SurfaceCard className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {monthCalendar}
            </SurfaceCard>
          ) : (
            <SurfaceCard className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
              {dayHeader}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                {dayBody}
              </div>
            </SurfaceCard>
          )}
        </Tabs>
      </div>

      {/* Desktop: month + day side by side */}
      <div className="hidden min-h-0 flex-1 gap-4 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,1fr)]">
        <SurfaceCard className="min-h-0 p-4 sm:p-5 lg:flex lg:flex-col lg:overflow-hidden">
          <MonthCalendar
            year={cursor.year}
            monthIndex={cursor.monthIndex}
            locale={locale}
            timeZone={timeZone}
            selectedDateIso={selectedDateIso}
            onSelectDate={(dateIso) => selectDate(dateIso)}
            onPrevMonth={() => shiftMonth(-1)}
            onNextMonth={() => shiftMonth(1)}
            markers={markers}
            openDays={openDays}
            blockedDays={blockedDays}
            fillHeight
          />
        </SurfaceCard>

        <SurfaceCard className="flex min-h-0 flex-col gap-3 overflow-hidden p-4 sm:p-5">
          {dayHeader}
          {dayBody}
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
      <CalendarDays className="mt-0.5 size-5 shrink-0 text-action" />
      <div className="min-w-0 space-y-1">
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
            href="/settings/calendar"
            className="text-sm font-medium text-action hover:underline"
          >
            {t("settings")}
          </Link>
        )}
      </div>
    </SurfaceCard>
  );
}
