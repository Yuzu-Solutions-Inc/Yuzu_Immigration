"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  addAvailabilityRangeAction,
  applyWeekdayHoursPresetAction,
  clearDayAvailabilityAction,
  clearWeekAvailabilityAction,
  deleteAvailabilityRuleAction,
} from "@/app/actions/booking";
import { Button } from "@/components/ui/button";
import {
  formatHmLabel,
  snapMinutes,
} from "@/lib/booking/availability";
import type { BookingAvailabilityRuleRow } from "@/lib/booking/types";
import { minutesFromHm } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const TEMPLATE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const HOURS = 24;
const HOUR_PX = 32;
const GRID_HEIGHT = HOURS * HOUR_PX;
const SNAP = 30;
const DAY_MINUTES = HOURS * 60;

type Draft = {
  weekday: number;
  anchor: number;
  cursor: number;
};

function yToMinutes(clientY: number, top: number, height: number) {
  const ratio = (clientY - top) / height;
  return snapMinutes(ratio * DAY_MINUTES, SNAP);
}

function draftRange(draft: Draft) {
  const start = Math.min(draft.anchor, draft.cursor);
  let end = Math.max(draft.anchor, draft.cursor);
  if (end === start) {
    end = Math.min(DAY_MINUTES, start + SNAP);
  }
  return { start, end };
}

export function WeekTemplateHours({
  locale,
  canManage,
  rules,
}: {
  locale: string;
  canManage: boolean;
  rules: BookingAvailabilityRuleRow[];
}) {
  const t = useTranslations("calendar");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const columnRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function setLiveDraft(next: Draft | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function saveDraft(next: Draft) {
    const { start, end } = draftRange(next);
    if (end - start < SNAP) return;
    startTransition(async () => {
      const result = await addAvailabilityRangeAction({
        locale,
        weekday: next.weekday,
        startMinutes: start,
        endMinutes: end,
      });
      if (result.error) toast.error(t(`errors.${result.error}`));
    });
  }

  function onColumnPointerDown(
    weekday: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (!canManage || pending) return;
    if ((event.target as HTMLElement).closest("[data-slot-block]")) return;
    const column = columnRefs.current[weekday];
    if (!column) return;
    event.preventDefault();
    column.setPointerCapture(event.pointerId);
    const rect = column.getBoundingClientRect();
    const minutes = yToMinutes(event.clientY, rect.top, rect.height);
    setLiveDraft({ weekday, anchor: minutes, cursor: minutes });
  }

  function onColumnPointerMove(
    weekday: number,
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    const live = draftRef.current;
    if (!live || live.weekday !== weekday) return;
    const column = columnRefs.current[weekday];
    if (!column) return;
    const rect = column.getBoundingClientRect();
    setLiveDraft({
      ...live,
      cursor: yToMinutes(event.clientY, rect.top, rect.height),
    });
  }

  function onColumnPointerUp(weekday: number) {
    const live = draftRef.current;
    setLiveDraft(null);
    if (!live || live.weekday !== weekday) return;
    saveDraft(live);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("weekTemplate")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("weekTemplateHelp")}</p>
          <p className="text-sm text-muted-foreground">{t("weekTemplateDragHelp")}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await applyWeekdayHoursPresetAction(locale);
                  if (result.error) toast.error(t(`errors.${result.error}`));
                  else toast.success(t("presetApplied"));
                });
              }}
            >
              {t("applyWeekdayPreset")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || rules.length === 0}
              onClick={() => {
                if (!window.confirm(t("clearWeekConfirm"))) return;
                startTransition(async () => {
                  const result = await clearWeekAvailabilityAction(locale);
                  if (result.error) toast.error(t(`errors.${result.error}`));
                  else toast.success(t("weekCleared"));
                });
              }}
            >
              {t("clearWeek")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface select-none">
        <div
          className="grid min-w-[52rem]"
          style={{ gridTemplateColumns: `3rem repeat(${TEMPLATE_WEEKDAYS.length}, minmax(0, 1fr))` }}
        >
          <div className="sticky left-0 z-10 border-b border-r border-border bg-surface" />
          {TEMPLATE_WEEKDAYS.map((weekday) => {
            const dayRules = rules.filter((rule) => rule.weekday === weekday);
            return (
              <div
                key={`head-${weekday}`}
                className="border-b border-border px-2 py-2 text-center"
              >
                <p className="font-heading text-sm font-semibold text-brand">
                  {t(`weekdaysShort.${WEEKDAY_KEYS[weekday]}`)}
                </p>
                {canManage && dayRules.length > 0 ? (
                  <button
                    type="button"
                    className="mt-0.5 text-[11px] font-medium text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await clearDayAvailabilityAction(
                          weekday,
                          locale,
                        );
                        if (result.error) {
                          toast.error(t(`errors.${result.error}`));
                        }
                      });
                    }}
                  >
                    {t("clearDay")}
                  </button>
                ) : (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dayRules.length === 0 ? t("closedDay") : "\u00a0"}
                  </p>
                )}
              </div>
            );
          })}

          <div className="relative border-r border-border bg-canvas/80">
            {Array.from({ length: HOURS }, (_, hour) => (
              <div
                key={hour}
                className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: hour * HOUR_PX + 2 }}
              >
                {formatHmLabel(hour * 60)}
              </div>
            ))}
            <div
              className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: GRID_HEIGHT - 10 }}
            >
              24:00
            </div>
            <div style={{ height: GRID_HEIGHT }} />
          </div>

          {TEMPLATE_WEEKDAYS.map((weekday) => {
            const dayRules = rules.filter((rule) => rule.weekday === weekday);
            const live =
              draft?.weekday === weekday ? draftRange(draft) : null;
            return (
              <div
                key={`col-${weekday}`}
                ref={(node) => {
                  columnRefs.current[weekday] = node;
                }}
                className={cn(
                  "relative border-l border-border bg-canvas/40",
                  canManage && "cursor-crosshair touch-none",
                )}
                style={{ height: GRID_HEIGHT }}
                onPointerDown={(event) => onColumnPointerDown(weekday, event)}
                onPointerMove={(event) => onColumnPointerMove(weekday, event)}
                onPointerUp={() => onColumnPointerUp(weekday)}
                onPointerCancel={() => setLiveDraft(null)}
              >
                {Array.from({ length: HOURS }, (_, hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                    style={{ top: hour * HOUR_PX, height: HOUR_PX }}
                  >
                    <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
                  </div>
                ))}

                {dayRules.map((rule) => {
                  const start = minutesFromHm(rule.start_time);
                  const end = minutesFromHm(rule.end_time);
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      data-slot-block
                      disabled={!canManage || pending}
                      aria-label={t("removeRule")}
                      title={canManage ? t("clickToRemoveSlot") : undefined}
                      className="absolute inset-x-1 overflow-hidden rounded-md bg-action px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-white shadow-sm hover:bg-[#4f46e5]"
                      style={{
                        top: (start / DAY_MINUTES) * GRID_HEIGHT,
                        height: Math.max(
                          16,
                          ((end - start) / DAY_MINUTES) * GRID_HEIGHT,
                        ),
                      }}
                      onClick={() => {
                        if (!canManage) return;
                        startTransition(async () => {
                          const result = await deleteAvailabilityRuleAction(
                            rule.id,
                            locale,
                          );
                          if (result.error) {
                            toast.error(t(`errors.${result.error}`));
                          }
                        });
                      }}
                    >
                      {formatHmLabel(start)}–{formatHmLabel(end)}
                    </button>
                  );
                })}

                {live ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-action bg-action/20 px-1.5 py-1 text-[11px] font-medium text-action"
                    style={{
                      top: (live.start / DAY_MINUTES) * GRID_HEIGHT,
                      height: Math.max(
                        16,
                        ((live.end - live.start) / DAY_MINUTES) * GRID_HEIGHT,
                      ),
                    }}
                  >
                    {formatHmLabel(live.start)}–{formatHmLabel(live.end)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
