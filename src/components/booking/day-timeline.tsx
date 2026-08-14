"use client";

import { Trash2 } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { blockRangeAction, unblockTimeAction } from "@/app/actions/booking";
import {
  formatHmLabel,
  mergeMinuteRanges,
  snapMinutes,
  type MinuteRange,
} from "@/lib/booking/availability";
import type {
  BookingAppointmentRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
} from "@/lib/booking/types";
import { clipToDayMinutes, zonedDateIso, zonedParts } from "@/lib/booking/timezone";
import { cn } from "@/lib/utils";

const HOURS = 24;
const DEFAULT_HOUR_PX = 56;
const MIN_HOUR_PX = 36;
const SNAP = 30;
const DAY_MINUTES = HOURS * 60;
/** Visible window: 09:00–17:00 (8 hours). Full day remains scrollable. */
const FOCUS_START_HOUR = 9;
const FOCUS_HOURS = 8;

type Draft = {
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

function styleForRange(
  start: number,
  end: number,
  gridHeight: number,
) {
  return {
    top: (start / DAY_MINUTES) * gridHeight,
    height: Math.max(18, ((end - start) / DAY_MINUTES) * gridHeight),
  };
}

export function DayTimeline({
  locale,
  canManage,
  dateIso,
  timeZone,
  appointments,
  blocked,
  googleBusy,
  openRanges,
  selectedAppointmentId,
  onSelectAppointment,
  className,
}: {
  locale: string;
  canManage: boolean;
  dateIso: string;
  timeZone: string;
  appointments: BookingAppointmentRow[];
  blocked: BookingBlockedTimeRow[];
  googleBusy: BookingGoogleBusyRow[];
  openRanges: MinuteRange[];
  selectedAppointmentId: string | null;
  onSelectAppointment: (id: string | null) => void;
  className?: string;
}) {
  const t = useTranslations("calendar");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hourPx, setHourPx] = useState(DEFAULT_HOUR_PX);
  const draftRef = useRef<Draft | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const gridHeight = HOURS * hourPx;
  const mergedOpen = mergeMinuteRanges(openRanges);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const syncHourPx = () => {
      const available = el.clientHeight;
      if (available <= 0) return;
      const next = Math.max(
        MIN_HOUR_PX,
        Math.round(available / FOCUS_HOURS),
      );
      setHourPx((prev) => (prev === next ? prev : next));
    };

    syncHourPx();
    const observer = new ResizeObserver(syncHourPx);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = FOCUS_START_HOUR * hourPx;
  }, [dateIso, hourPx]);

  function setLiveDraft(next: Draft | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function saveDraft(next: Draft) {
    const { start, end } = draftRange(next);
    if (end - start < SNAP) return;
    startTransition(async () => {
      const result = await blockRangeAction({
        locale,
        dateIso,
        startMinutes: start,
        endMinutes: end,
      });
      if (result.error) toast.error(t(`errors.${result.error}`));
      else toast.success(t("rangeBlocked"));
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canManage || pending) return;
    if ((event.target as HTMLElement).closest("[data-slot-item]")) return;
    const column = columnRef.current;
    if (!column) return;
    event.preventDefault();
    column.setPointerCapture(event.pointerId);
    const rect = column.getBoundingClientRect();
    const minutes = yToMinutes(event.clientY, rect.top, rect.height);
    setLiveDraft({ anchor: minutes, cursor: minutes });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const live = draftRef.current;
    if (!live) return;
    const column = columnRef.current;
    if (!column) return;
    const rect = column.getBoundingClientRect();
    setLiveDraft({
      ...live,
      cursor: yToMinutes(event.clientY, rect.top, rect.height),
    });
  }

  function onPointerUp() {
    const live = draftRef.current;
    setLiveDraft(null);
    if (!live) return;
    saveDraft(live);
  }

  const now = new Date();
  const isToday = zonedDateIso(now, timeZone) === dateIso;
  const nowParts = isToday ? zonedParts(now, timeZone) : null;
  const nowMinutes = nowParts
    ? nowParts.hour * 60 + nowParts.minute
    : null;
  const live = draft ? draftRange(draft) : null;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <p className="shrink-0 text-xs text-muted-foreground">{t("timelineHint")}</p>
      {canManage ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          {t("timelineDragHelp")}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-100 ring-1 ring-success/60" />
          {t("legendOpen")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-action" />
          {t("legendBookings")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warning" />
          {t("legendBlocked")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-300" />
          {t("legendGoogle")}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface select-none"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: "3rem minmax(0, 1fr)" }}
        >
          <div className="relative border-r border-border bg-canvas/80">
            {Array.from({ length: HOURS }, (_, hour) => (
              <div
                key={hour}
                className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: hour * hourPx + 2 }}
              >
                {formatHmLabel(hour * 60)}
              </div>
            ))}
            <div
              className="absolute right-1 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: gridHeight - 10 }}
            >
              24:00
            </div>
            <div style={{ height: gridHeight }} />
          </div>

          <div
            ref={columnRef}
            className={cn(
              "relative bg-canvas/40",
              canManage && "cursor-crosshair touch-none",
            )}
            style={{ height: gridHeight }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setLiveDraft(null)}
          >
            {Array.from({ length: HOURS }, (_, hour) => (
              <div
                key={hour}
                className="pointer-events-none absolute inset-x-0 border-t border-border/70"
                style={{ top: hour * hourPx, height: hourPx }}
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
              </div>
            ))}

            {mergedOpen.map((range) => (
              <div
                key={`open-${range.start}-${range.end}`}
                className="pointer-events-none absolute inset-x-0 z-0 bg-success-bg/70"
                style={styleForRange(range.start, range.end, gridHeight)}
                aria-hidden
              />
            ))}

            {googleBusy.map((row) => {
              const range = clipToDayMinutes(
                new Date(row.starts_at),
                new Date(row.ends_at),
                dateIso,
                timeZone,
              );
              if (!range) return null;
              return (
                <div
                  key={row.id}
                  data-slot-item
                  className="absolute inset-x-1 z-[1] overflow-hidden rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-left text-[11px] leading-tight text-slate-700"
                  style={styleForRange(range.start, range.end, gridHeight)}
                  title={row.summary ?? t("googleEventUntitled")}
                >
                  <p className="truncate font-medium">
                    {row.summary?.trim() || t("googleEventUntitled")}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {t("googleBusyLabel")}
                  </p>
                </div>
              );
            })}

            {blocked.map((row) => {
              const range = clipToDayMinutes(
                new Date(row.starts_at),
                new Date(row.ends_at),
                dateIso,
                timeZone,
              );
              if (!range) return null;
              return (
                <button
                  key={row.id}
                  type="button"
                  data-slot-item
                  disabled={!canManage || pending}
                  aria-label={t("clickToRemoveBlock")}
                  title={canManage ? t("clickToRemoveBlock") : undefined}
                  className="group absolute inset-x-1 z-[2] overflow-hidden rounded-md border border-amber-100 bg-warning-bg px-1.5 py-0.5 text-left text-[11px] leading-tight text-warning-text hover:bg-amber-100 disabled:hover:bg-warning-bg"
                  style={styleForRange(range.start, range.end, gridHeight)}
                  onClick={() => {
                    if (!canManage) return;
                    startTransition(async () => {
                      const result = await unblockTimeAction(row.id, locale);
                      if (result.error) toast.error(t(`errors.${result.error}`));
                      else toast.success(t("dayUnblocked"));
                    });
                  }}
                >
                  <span className="flex items-start justify-between gap-1">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {t("legendBlocked")}
                      </span>
                      <span className="block truncate text-[10px] text-warning-text/80">
                        {formatHmLabel(range.start)}–{formatHmLabel(range.end)}
                      </span>
                    </span>
                    {canManage ? (
                      <Trash2
                        aria-hidden
                        className="mt-px size-3 shrink-0 text-warning-text opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}

            {appointments.map((row) => {
              if (row.status === "cancelled") return null;
              const range = clipToDayMinutes(
                new Date(row.starts_at),
                new Date(row.ends_at),
                dateIso,
                timeZone,
              );
              if (!range) return null;
              const selected = selectedAppointmentId === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  data-slot-item
                  className={cn(
                    "absolute inset-x-1 z-[3] overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm",
                    selected
                      ? "bg-action-hover ring-2 ring-action ring-offset-1"
                      : "bg-action hover:bg-action-hover",
                  )}
                  style={styleForRange(range.start, range.end, gridHeight)}
                  onClick={() =>
                    onSelectAppointment(selected ? null : row.id)
                  }
                >
                  <p className="truncate font-medium">{row.guest_name}</p>
                  <p className="truncate text-[10px] text-white/85">
                    {row.service?.title ?? t("unknownService")}
                  </p>
                </button>
              );
            })}

            {live ? (
              <div
                className="pointer-events-none absolute inset-x-1 z-[4] rounded-md border-2 border-dashed border-warning bg-warning/25 px-1.5 py-0.5 text-[11px] font-medium text-warning-text"
                style={styleForRange(live.start, live.end, gridHeight)}
              >
                {formatHmLabel(live.start)}–{formatHmLabel(live.end)}
              </div>
            ) : null}

            {nowMinutes != null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-[5] flex items-center"
                style={{ top: (nowMinutes / DAY_MINUTES) * gridHeight }}
              >
                <span className="sr-only">{t("timelineNow")}</span>
                <span className="size-2 -ml-1 rounded-full bg-destructive" />
                <span className="h-px flex-1 bg-destructive" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
