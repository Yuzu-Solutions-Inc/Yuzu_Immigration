"use client";

import { Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  formatMonthYear,
  monthGrid,
  weekStartsOn,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function MonthCalendar({
  year,
  monthIndex,
  locale,
  timeZone,
  selectedDateIso,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  markers,
  availableDays,
  openDays,
  blockedDays,
  fillHeight = false,
  compact = false,
}: {
  year: number;
  monthIndex: number;
  locale: string;
  timeZone: string;
  selectedDateIso: string | null;
  onSelectDate: (dateIso: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  markers?: Record<string, number>;
  /** When set, days outside the set are disabled (public booking). */
  availableDays?: Set<string>;
  /** Indicator-only: green dot for days with residual open booking hours. */
  openDays?: Set<string>;
  blockedDays?: Set<string>;
  /** Stretch day cells so the month grid fills its parent (desktop calendar). */
  fillHeight?: boolean;
  /** Tighter cells for public booking, where the month should stay close to square. */
  compact?: boolean;
}) {
  const t = useTranslations("calendar");
  const start = weekStartsOn(locale);
  const orderedWeekdays = [
    ...WEEKDAY_KEYS.slice(start),
    ...WEEKDAY_KEYS.slice(0, start),
  ];
  const cells = monthGrid(year, monthIndex, start);
  const todayIso = zonedDateIso(new Date(), timeZone);
  const weekRows = Math.ceil(cells.length / 7);

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        fillHeight && "h-full min-h-0",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h2
          className={cn(
            "font-heading font-semibold text-brand",
            compact ? "text-base" : "text-lg",
          )}
        >
          {formatMonthYear(year, monthIndex, locale)}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onPrevMonth}
            aria-label={t("prevMonth")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onNextMonth}
            aria-label={t("nextMonth")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid shrink-0 grid-cols-7 gap-1 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase",
          compact && "text-[11px]",
        )}
      >
        {orderedWeekdays.map((key) => (
          <div key={key} className={compact ? "py-0.5" : "py-1"}>
            {t(`weekdaysShort.${key}`)}
          </div>
        ))}
      </div>

      <div
        className={cn(
          "grid grid-cols-7 gap-1",
          fillHeight && "min-h-0 flex-1",
        )}
        style={
          fillHeight
            ? { gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {cells.map((cell) => {
          const count = markers?.[cell.dateIso] ?? 0;
          const selected = selectedDateIso === cell.dateIso;
          const isToday = cell.dateIso === todayIso;
          const isBlocked = blockedDays?.has(cell.dateIso) ?? false;
          const hasAvailability = availableDays?.has(cell.dateIso) ?? false;
          const hasOpenHours =
            hasAvailability || (openDays?.has(cell.dateIso) ?? false);
          const disabled = Boolean(availableDays) && !hasAvailability;
          const dayNumber = Number(cell.dateIso.slice(8, 10));
          return (
            <button
              key={cell.dateIso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(cell.dateIso)}
              aria-label={
                isBlocked && count > 0
                  ? t("blockedDayWithBookingsAria", {
                      day: dayNumber,
                      count,
                    })
                  : isBlocked
                    ? t("blockedDayAria", { day: dayNumber })
                    : undefined
              }
              className={cn(
                "relative flex flex-col items-center rounded-xl border px-1 text-sm transition-colors",
                fillHeight
                  ? cn(
                      "h-full min-h-0 justify-center",
                      compact
                        ? "min-h-9 py-0.5 sm:min-h-11 lg:py-0.5"
                        : "min-h-10 py-1 sm:min-h-16 sm:py-2 lg:py-1",
                    )
                  : compact
                    ? "min-h-10 py-1 sm:min-h-11"
                    : "min-h-12 py-1.5 sm:min-h-16 sm:py-2",
                cell.inMonth ? "bg-surface" : "bg-canvas/60 text-muted-foreground",
                selected
                  ? "border-action bg-action/5 text-brand"
                  : "border-transparent hover:border-border hover:bg-muted/60",
                isToday && !selected && "border-action/40",
                isBlocked && !selected && "border-graphite-200 bg-blocked-bg text-blocked-text hover:border-graphite-200 hover:bg-graphite-200",
                isBlocked && selected && "border-blocked bg-blocked-bg",
                isBlocked && !cell.inMonth && "bg-blocked-bg/50",
                disabled && "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent",
              )}
            >
              {isBlocked ? (
                <Ban
                  className="absolute top-1 right-1 size-2.5 text-blocked sm:top-1.5 sm:right-1.5 sm:size-3"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full",
                  compact
                    ? "size-6 text-[13px]"
                    : fillHeight
                      ? "size-6 text-[13px] sm:size-7 sm:text-sm lg:size-6 lg:text-[13px]"
                      : "size-6 text-[13px] sm:size-7 sm:text-sm",
                  isToday && "bg-action font-semibold text-action-foreground",
                )}
              >
                {dayNumber}
              </span>
              {count > 0 || hasOpenHours || isBlocked ? (
                <span className="mt-0.5 flex items-center gap-0.5 sm:mt-1">
                  {count > 0 ? (
                    <span
                      className="h-1 w-1 rounded-full bg-action sm:h-1.5 sm:w-1.5"
                      title={t("dayBookingCount", { count })}
                    />
                  ) : null}
                  {hasOpenHours ? (
                    <span
                      className="h-1 w-1 rounded-full bg-success sm:h-1.5 sm:w-1.5"
                      title={t("legendOpen")}
                    />
                  ) : null}
                  {isBlocked && count === 0 && !hasOpenHours ? (
                    <span className="h-1 w-1 rounded-full bg-blocked sm:h-1.5 sm:w-1.5" />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {blockedDays || openDays ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-action" />
            {t("legendBookings")}
          </span>
          {openDays ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {t("legendOpen")}
            </span>
          ) : null}
          {blockedDays ? (
            <span className="inline-flex items-center gap-1.5">
              <Ban className="size-3 text-blocked" aria-hidden />
              {t("legendBlocked")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
