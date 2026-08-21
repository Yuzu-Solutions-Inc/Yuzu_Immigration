"use client";

import { Trash2 } from "lucide-react";
import {
  useEffect,
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
  subtractMinuteRanges,
  type MinuteRange,
} from "@/lib/booking/availability";
import type {
  BookingAppointmentRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingMicrosoftBusyRow,
} from "@/lib/booking/types";
import { clipToDayMinutes, zonedDateIso, zonedParts } from "@/lib/booking/timezone";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { cn } from "@/lib/utils";

const HOURS = 24;
const DEFAULT_HOUR_PX = 48;
const MIN_HOUR_PX = 32;
const MAX_HOUR_PX = 64;
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

function blockHeightPx(start: number, end: number, gridHeight: number) {
  return Math.max(18, ((end - start) / DAY_MINUTES) * gridHeight);
}

function styleForRange(start: number, end: number, gridHeight: number) {
  return {
    top: (start / DAY_MINUTES) * gridHeight,
    height: blockHeightPx(start, end, gridHeight),
  };
}

/** How much text fits in a day-grid block without clipping. */
function blockDensity(heightPx: number): "xs" | "sm" | "md" | "lg" {
  if (heightPx < 26) return "xs";
  if (heightPx < 40) return "sm";
  if (heightPx < 56) return "md";
  return "lg";
}

function timeRangeLabel(start: number, end: number) {
  return `${formatHmLabel(start)}–${formatHmLabel(end)}`;
}

export function DayTimeline({
  locale,
  canManage,
  dateIso,
  timeZone,
  appointments,
  blocked,
  googleBusy,
  microsoftBusy,
  openRanges,
  selectedAppointmentId,
  onSelectAppointment,
  compactChrome = false,
  className,
}: {
  locale: string;
  canManage: boolean;
  dateIso: string;
  timeZone: string;
  appointments: BookingAppointmentRow[];
  blocked: BookingBlockedTimeRow[];
  googleBusy: BookingGoogleBusyRow[];
  microsoftBusy: BookingMicrosoftBusyRow[];
  openRanges: MinuteRange[];
  selectedAppointmentId: string | null;
  onSelectAppointment: (id: string | null) => void;
  compactChrome?: boolean;
  className?: string;
}) {
  const t = useTranslations("calendar");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hourPx, setHourPx] = useState(DEFAULT_HOUR_PX);
  /** Drag-to-block fights touch scrolling; only enable on fine pointers. */
  const [dragEnabled, setDragEnabled] = useState(false);
  const draftRef = useRef<Draft | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const gridHeight = HOURS * hourPx;
  const mergedOpen = mergeMinuteRanges(openRanges);

  const appointmentRanges = appointments.flatMap((row) => {
    if (row.status === "cancelled") return [];
    const range = clipToDayMinutes(
      new Date(row.starts_at),
      new Date(row.ends_at),
      dateIso,
      timeZone,
    );
    return range ? [range] : [];
  });

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setDragEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const syncHourPx = () => {
      const available = el.clientHeight;
      if (available <= 0) return;
      const viewportCap = Math.floor(window.innerHeight / FOCUS_HOURS);
      const next = Math.min(
        MAX_HOUR_PX,
        viewportCap,
        Math.max(MIN_HOUR_PX, Math.round(available / FOCUS_HOURS)),
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
    if (!dragEnabled || !canManage || pending) return;
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
      <p className={cn("shrink-0 text-xs text-muted-foreground", compactChrome && "hidden")}>
        {t("timelineHint")}
      </p>
      {canManage ? (
        <p className={cn("shrink-0 text-xs text-muted-foreground", compactChrome && "sr-only")}>
          {dragEnabled ? t("timelineDragHelp") : t("timelineTouchHelp")}
        </p>
      ) : null}

      <div
        className={cn(
          "flex shrink-0 flex-wrap gap-3 text-[11px] text-muted-foreground",
          compactChrome && "flex-nowrap gap-2 overflow-x-auto pb-0.5",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-100 ring-1 ring-success/60" />
          {t("legendOpen")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-action" />
          {t("legendBookings")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-blocked" />
          {t("legendBlocked")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-300" />
          {t("legendExternal")}
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
              "relative bg-canvas/40 touch-pan-y",
              dragEnabled && canManage && "cursor-crosshair touch-none",
            )}
            style={{ height: gridHeight }}
            onPointerDown={dragEnabled ? onPointerDown : undefined}
            onPointerMove={dragEnabled ? onPointerMove : undefined}
            onPointerUp={dragEnabled ? onPointerUp : undefined}
            onPointerCancel={
              dragEnabled ? () => setLiveDraft(null) : undefined
            }
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

            {(
              [
                ...googleBusy.map((row) => ({
                  ...row,
                  source: "google" as const,
                })),
                ...microsoftBusy.map((row) => ({
                  id: row.id,
                  starts_at: row.starts_at,
                  ends_at: row.ends_at,
                  summary: row.summary,
                  source: "outlook" as const,
                })),
              ] as const
            ).map((row) => {
              const range = clipToDayMinutes(
                new Date(row.starts_at),
                new Date(row.ends_at),
                dateIso,
                timeZone,
              );
              if (!range) return null;
              const height = blockHeightPx(
                range.start,
                range.end,
                gridHeight,
              );
              const density = blockDensity(height);
              const summary =
                row.summary?.trim() || t("googleEventUntitled");
              const when = timeRangeLabel(range.start, range.end);
              return (
                <div
                  key={`${row.source}-${row.id}`}
                  data-slot-item
                  className={cn(
                    "absolute inset-x-1 z-[1] overflow-hidden rounded-md border border-slate-200 bg-slate-100 px-1.5 text-left text-[11px] leading-tight text-slate-700",
                    density === "xs" || density === "sm"
                      ? "flex items-center py-0"
                      : "py-0.5",
                  )}
                  style={styleForRange(range.start, range.end, gridHeight)}
                  title={`${when} · ${summary}`}
                >
                  {density === "xs" ? (
                    <p className="truncate font-medium tabular-nums">
                      {formatHmLabel(range.start)} {summary}
                    </p>
                  ) : density === "sm" ? (
                    <p className="truncate font-medium">
                      <span className="tabular-nums">{when}</span>
                      <span className="text-slate-500"> · </span>
                      {summary}
                    </p>
                  ) : (
                    <>
                      <p className="truncate font-medium tabular-nums">
                        {when}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {summary}
                      </p>
                      {density === "lg" ? (
                        <p className="truncate text-[10px] text-slate-500">
                          {row.source === "outlook"
                            ? t("microsoftBusyLabel")
                            : t("googleBusyLabel")}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}

            {blocked.flatMap((row) => {
              const range = clipToDayMinutes(
                new Date(row.starts_at),
                new Date(row.ends_at),
                dateIso,
                timeZone,
              );
              if (!range) return [];
              // Keep existing bookings visible on top of blocked time.
              return subtractMinuteRanges(range, appointmentRanges).map(
                (segment) => {
                  const height = blockHeightPx(
                    segment.start,
                    segment.end,
                    gridHeight,
                  );
                  const density = blockDensity(height);
                  const when = timeRangeLabel(segment.start, segment.end);
                  const label = t("legendBlocked");
                  return (
                    <button
                      key={`${row.id}-${segment.start}-${segment.end}`}
                      type="button"
                      data-slot-item
                      disabled={!canManage || pending}
                      aria-label={t("clickToRemoveBlock")}
                      title={
                        canManage
                          ? `${when} · ${label} — ${t("clickToRemoveBlock")}`
                          : `${when} · ${label}`
                      }
                      className={cn(
                        "group absolute inset-x-1 z-[2] overflow-hidden rounded-md border border-graphite-200 bg-blocked-bg/90 px-1.5 text-left text-[11px] leading-tight text-blocked-text hover:bg-graphite-200 disabled:hover:bg-blocked-bg/90",
                        density === "xs" || density === "sm"
                          ? "flex items-center py-0"
                          : "py-0.5",
                      )}
                      style={styleForRange(
                        segment.start,
                        segment.end,
                        gridHeight,
                      )}
                      onClick={() => {
                        if (!canManage) return;
                        startTransition(async () => {
                          const result = await unblockTimeAction(
                            row.id,
                            locale,
                          );
                          if (result.error)
                            toast.error(t(`errors.${result.error}`));
                          else toast.success(t("dayUnblocked"));
                        });
                      }}
                    >
                      <span className="flex w-full min-w-0 items-center justify-between gap-1">
                        <span className="min-w-0">
                          {density === "xs" ? (
                            <span className="block truncate font-medium tabular-nums">
                              {formatHmLabel(segment.start)} {label}
                            </span>
                          ) : density === "sm" ? (
                            <span className="block truncate font-medium">
                              <span className="tabular-nums">{when}</span>
                              <span className="text-blocked-text/70"> · </span>
                              {label}
                            </span>
                          ) : (
                            <>
                              <span className="block truncate font-medium">
                                {label}
                              </span>
                              <span className="block truncate text-[10px] tabular-nums text-blocked-text/80">
                                {when}
                              </span>
                            </>
                          )}
                        </span>
                        {canManage && density !== "xs" ? (
                          <Trash2
                            aria-hidden
                            className="size-3 shrink-0 text-blocked-text opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                },
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
              const height = blockHeightPx(
                range.start,
                range.end,
                gridHeight,
              );
              const density = blockDensity(height);
              const when = timeRangeLabel(range.start, range.end);
              const service =
                row.service
                  ? serviceTitle(row.service, locale)
                  : t("unknownService");
              const title = `${when} · ${row.guest_name} · ${service}`;
              return (
                <button
                  key={row.id}
                  type="button"
                  data-slot-item
                  title={title}
                  className={cn(
                    "absolute inset-x-1 z-[3] overflow-hidden rounded-md px-1.5 text-left text-[11px] leading-tight text-action-foreground shadow-sm",
                    density === "xs" || density === "sm"
                      ? "flex items-center py-0"
                      : "py-0.5",
                    selected
                      ? "bg-action-hover ring-2 ring-action ring-offset-1"
                      : "bg-action hover:bg-action-hover",
                  )}
                  style={styleForRange(range.start, range.end, gridHeight)}
                  onClick={() =>
                    onSelectAppointment(selected ? null : row.id)
                  }
                >
                  {density === "xs" ? (
                    <p className="truncate font-medium">
                      <span className="tabular-nums">
                        {formatHmLabel(range.start)}
                      </span>{" "}
                      {row.guest_name}
                    </p>
                  ) : density === "sm" ? (
                    <p className="truncate font-medium">
                      <span className="tabular-nums">{when}</span>
                      <span className="text-action-foreground/70"> · </span>
                      {row.guest_name}
                    </p>
                  ) : density === "md" ? (
                    <>
                      <p className="truncate font-medium tabular-nums">
                        {when}
                      </p>
                      <p className="truncate text-[10px] text-action-foreground/90">
                        {row.guest_name}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate font-medium tabular-nums">
                        {when}
                      </p>
                      <p className="truncate text-[10px] text-action-foreground/90">
                        {row.guest_name}
                      </p>
                      <p className="truncate text-[10px] text-action-foreground/75">
                        {service}
                      </p>
                    </>
                  )}
                </button>
              );
            })}

            {live ? (
              <div
                className="pointer-events-none absolute inset-x-1 z-[4] flex items-center rounded-md border-2 border-dashed border-blocked bg-blocked/20 px-1.5 py-0 text-[11px] font-medium text-blocked-text"
                style={styleForRange(live.start, live.end, gridHeight)}
              >
                <span className="truncate tabular-nums">
                  {timeRangeLabel(live.start, live.end)}
                </span>
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
