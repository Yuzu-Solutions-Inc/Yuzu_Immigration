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
  blockedDays,
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
  availableDays?: Set<string>;
  blockedDays?: Set<string>;
}) {
  const t = useTranslations("calendar");
  const start = weekStartsOn(locale);
  const orderedWeekdays = [
    ...WEEKDAY_KEYS.slice(start),
    ...WEEKDAY_KEYS.slice(0, start),
  ];
  const cells = monthGrid(year, monthIndex, start);
  const todayIso = zonedDateIso(new Date(), timeZone);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
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

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {orderedWeekdays.map((key) => (
          <div key={key} className="py-1">
            {t(`weekdaysShort.${key}`)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const count = markers?.[cell.dateIso] ?? 0;
          const selected = selectedDateIso === cell.dateIso;
          const isToday = cell.dateIso === todayIso;
          const isBlocked = blockedDays?.has(cell.dateIso) ?? false;
          const hasAvailability = availableDays?.has(cell.dateIso) ?? false;
          const disabled = Boolean(availableDays) && !hasAvailability;
          const dayNumber = Number(cell.dateIso.slice(8, 10));
          return (
            <button
              key={cell.dateIso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(cell.dateIso)}
              aria-label={
                isBlocked
                  ? t("blockedDayAria", { day: dayNumber })
                  : undefined
              }
              className={cn(
                "relative flex min-h-16 flex-col items-center rounded-xl border px-1 py-2 text-sm transition-colors",
                cell.inMonth ? "bg-surface" : "bg-canvas/60 text-muted-foreground",
                selected
                  ? "border-action bg-action/5 text-brand"
                  : "border-transparent hover:border-border hover:bg-muted/60",
                isToday && !selected && "border-action/40",
                isBlocked && !selected && "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 hover:bg-amber-50",
                isBlocked && selected && "border-amber-500 bg-amber-50",
                isBlocked && !cell.inMonth && "bg-amber-50/50",
                disabled && "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent",
              )}
            >
              {isBlocked ? (
                <Ban
                  className="absolute top-1.5 right-1.5 size-3 text-amber-600"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full",
                  isToday && "bg-action font-semibold text-white",
                )}
              >
                {dayNumber}
              </span>
              {count > 0 ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-action" />
              ) : hasAvailability ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />
              ) : isBlocked ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
              ) : null}
            </button>
          );
        })}
      </div>
      {blockedDays ? (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-action" />
            {t("legendBookings")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Ban className="size-3 text-amber-600" aria-hidden />
            {t("legendBlocked")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
