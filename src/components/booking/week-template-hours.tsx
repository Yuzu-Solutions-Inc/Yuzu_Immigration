"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

const TIME_OPTIONS = Array.from({ length: (DAY_MINUTES / SNAP) + 1 }, (_, i) =>
  i * SNAP,
);

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

function minutesToHm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  const [dragEnabled, setDragEnabled] = useState(false);
  const [addByDay, setAddByDay] = useState<
    Record<number, { start: number; end: number }>
  >({});
  const draftRef = useRef<Draft | null>(null);
  const columnRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setDragEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const rulesByDay = useMemo(() => {
    const map = new Map<number, BookingAvailabilityRuleRow[]>();
    for (const weekday of TEMPLATE_WEEKDAYS) {
      map.set(
        weekday,
        rules
          .filter((rule) => rule.weekday === weekday)
          .sort(
            (a, b) =>
              minutesFromHm(a.start_time) - minutesFromHm(b.start_time),
          ),
      );
    }
    return map;
  }, [rules]);

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
    if (!dragEnabled || !canManage || pending) return;
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

  function addRange(weekday: number) {
    const draftAdd = addByDay[weekday] ?? { start: 9 * 60, end: 17 * 60 };
    if (draftAdd.end <= draftAdd.start) {
      toast.error(t("errors.invalid_range"));
      return;
    }
    startTransition(async () => {
      const result = await addAvailabilityRangeAction({
        locale,
        weekday,
        startMinutes: draftAdd.start,
        endMinutes: draftAdd.end,
      });
      if (result.error) toast.error(t(`errors.${result.error}`));
    });
  }

  const toolbar = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("weekTemplate")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("weekTemplateHelp")}</p>
        <p className="hidden text-sm text-muted-foreground lg:block">
          {t("weekTemplateDragHelp")}
        </p>
        <p className="text-sm text-muted-foreground lg:hidden">
          {t("weekTemplateTouchHelp")}
        </p>
      </div>
      {canManage ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
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
            className="flex-1 sm:flex-none"
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
  );

  return (
    <section className="space-y-4">
      {toolbar}

      {/* Mobile / tablet: one day at a time list editor */}
      <div className="space-y-3 lg:hidden">
        {TEMPLATE_WEEKDAYS.map((weekday) => {
          const dayRules = rulesByDay.get(weekday) ?? [];
          const add =
            addByDay[weekday] ?? { start: 9 * 60, end: 17 * 60 };
          return (
            <div
              key={`mobile-${weekday}`}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-heading text-sm font-semibold text-brand">
                  {t(`weekdays.${WEEKDAY_KEYS[weekday]}`)}
                </p>
                {canManage && dayRules.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    className="h-9 text-muted-foreground hover:text-destructive"
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
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {dayRules.length === 0 ? t("closedDay") : null}
                  </span>
                )}
              </div>

              {dayRules.length === 0 ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  {t("closedDay")}
                </p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {dayRules.map((rule) => {
                    const start = minutesFromHm(rule.start_time);
                    const end = minutesFromHm(rule.end_time);
                    return (
                      <li
                        key={rule.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-action/10 px-3 py-2"
                      >
                        <span className="text-sm font-medium text-brand tabular-nums">
                          {formatHmLabel(start)}–{formatHmLabel(end)}
                        </span>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={pending}
                            aria-label={t("removeRule")}
                            onClick={() => {
                              startTransition(async () => {
                                const result =
                                  await deleteAvailabilityRuleAction(
                                    rule.id,
                                    locale,
                                  );
                                if (result.error) {
                                  toast.error(t(`errors.${result.error}`));
                                }
                              });
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              {canManage ? (
                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <label className="min-w-[5.5rem] flex-1 space-y-1 text-xs text-muted-foreground">
                    <span>{t("addStart")}</span>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-surface px-2 text-sm text-brand"
                      value={add.start}
                      onChange={(event) =>
                        setAddByDay((prev) => ({
                          ...prev,
                          [weekday]: {
                            ...add,
                            start: Number(event.target.value),
                          },
                        }))
                      }
                    >
                      {TIME_OPTIONS.slice(0, -1).map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutesToHm(minutes)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[5.5rem] flex-1 space-y-1 text-xs text-muted-foreground">
                    <span>{t("addEnd")}</span>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-surface px-2 text-sm text-brand"
                      value={add.end}
                      onChange={(event) =>
                        setAddByDay((prev) => ({
                          ...prev,
                          [weekday]: {
                            ...add,
                            end: Number(event.target.value),
                          },
                        }))
                      }
                    >
                      {TIME_OPTIONS.slice(1).map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutesToHm(minutes)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10"
                    disabled={pending || add.end <= add.start}
                    onClick={() => addRange(weekday)}
                  >
                    {t("addRule")}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Desktop: drag grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface select-none lg:block">
        <div
          className="grid min-w-[52rem]"
          style={{
            gridTemplateColumns: `3rem repeat(${TEMPLATE_WEEKDAYS.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 border-b border-r border-border bg-surface" />
          {TEMPLATE_WEEKDAYS.map((weekday) => {
            const dayRules = rulesByDay.get(weekday) ?? [];
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
                    className="mt-0.5 min-h-8 px-1 text-[11px] font-medium text-muted-foreground hover:text-destructive"
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
            const dayRules = rulesByDay.get(weekday) ?? [];
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
                  dragEnabled && canManage && "cursor-crosshair touch-none",
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
                      className="group absolute inset-x-1 overflow-hidden rounded-md bg-action px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-action-foreground shadow-sm hover:bg-action-hover"
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
                      <span className="flex items-start justify-between gap-1">
                        <span className="min-w-0 truncate">
                          {formatHmLabel(start)}–{formatHmLabel(end)}
                        </span>
                        {canManage ? (
                          <Trash2
                            aria-hidden
                            className="mt-px size-3 shrink-0 opacity-100"
                          />
                        ) : null}
                      </span>
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
