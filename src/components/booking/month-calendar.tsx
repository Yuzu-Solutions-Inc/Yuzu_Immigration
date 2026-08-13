"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
          const hasAvailability = availableDays?.has(cell.dateIso) ?? false;
          const disabled = Boolean(availableDays) && !hasAvailability;
          return (
            <button
              key={cell.dateIso}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDate(cell.dateIso)}
              className={cn(
                "relative flex min-h-16 flex-col items-center rounded-xl border px-1 py-2 text-sm transition-colors",
                cell.inMonth ? "bg-surface" : "bg-canvas/60 text-muted-foreground",
                selected
                  ? "border-action bg-action/5 text-brand"
                  : "border-transparent hover:border-border hover:bg-muted/60",
                isToday && !selected && "border-action/40",
                disabled && "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full",
                  isToday && "bg-action font-semibold text-white",
                )}
              >
                {Number(cell.dateIso.slice(8, 10))}
              </span>
              {count > 0 ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-action" />
              ) : hasAvailability ? (
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
