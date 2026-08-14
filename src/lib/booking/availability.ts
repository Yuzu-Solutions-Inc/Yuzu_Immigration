import {
  addDaysToIsoDate,
  clipToDayMinutes,
  minutesFromHm,
  pad2,
  weekdayFromIsoDate,
} from "@/lib/booking/timezone";

export type MinuteRange = {
  start: number;
  end: number;
};

const DAY_MINUTES = 24 * 60;

export function clampMinutes(value: number, max = DAY_MINUTES) {
  return Math.max(0, Math.min(max, value));
}

export function snapMinutes(value: number, step = 30) {
  return clampMinutes(Math.round(value / step) * step);
}

export function minutesToPgTime(minutes: number) {
  const clamped = clampMinutes(minutes);
  if (clamped >= DAY_MINUTES) return "24:00:00";
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}:00`;
}

export function formatHmLabel(minutes: number) {
  const clamped = clampMinutes(minutes);
  if (clamped >= DAY_MINUTES) return "24:00";
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function mergeMinuteRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = ranges
    .map((range) => ({
      start: clampMinutes(Math.min(range.start, range.end)),
      end: clampMinutes(Math.max(range.start, range.end)),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: MinuteRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Remove `cutouts` from `range`, returning the remaining visible segments. */
export function subtractMinuteRanges(
  range: MinuteRange,
  cutouts: MinuteRange[],
): MinuteRange[] {
  const start = clampMinutes(Math.min(range.start, range.end));
  const end = clampMinutes(Math.max(range.start, range.end));
  if (end <= start) return [];

  let segments: MinuteRange[] = [{ start, end }];
  for (const cut of mergeMinuteRanges(cutouts)) {
    const next: MinuteRange[] = [];
    for (const segment of segments) {
      if (cut.end <= segment.start || cut.start >= segment.end) {
        next.push(segment);
        continue;
      }
      if (cut.start > segment.start) {
        next.push({ start: segment.start, end: cut.start });
      }
      if (cut.end < segment.end) {
        next.push({ start: cut.end, end: segment.end });
      }
    }
    segments = next;
  }
  return segments;
}

type OpenCapacityInterval = {
  starts_at: string;
  ends_at: string;
};

/**
 * Civil dates (today → window) where the host still has residual open hours
 * after blocked time, Google busy, and buffered bookings are removed.
 */
export function listCivilDaysWithOpenCapacity(input: {
  timeZone: string;
  todayIso: string;
  windowDays: number;
  minNoticeHours: number;
  bufferMinutes: number;
  rules: { weekday: number; start_time: string; end_time: string }[];
  blocked: OpenCapacityInterval[];
  busy: OpenCapacityInterval[];
  fullyBlockedDays?: Set<string>;
  from?: Date;
}): Set<string> {
  const openByWeekday = new Map<number, MinuteRange[]>();
  for (const rule of input.rules) {
    const list = openByWeekday.get(rule.weekday) ?? [];
    list.push({
      start: minutesFromHm(rule.start_time),
      end: minutesFromHm(rule.end_time),
    });
    openByWeekday.set(rule.weekday, list);
  }
  for (const [weekday, ranges] of openByWeekday) {
    openByWeekday.set(weekday, mergeMinuteRanges(ranges));
  }

  const now = input.from ?? new Date();
  const earliestMs = now.getTime() + input.minNoticeHours * 3_600_000;
  const bufferMs = input.bufferMinutes * 60_000;
  const days = new Set<string>();
  const windowDays = Math.max(0, input.windowDays);

  for (let i = 0; i < windowDays; i += 1) {
    const dateIso = addDaysToIsoDate(input.todayIso, i);
    if (input.fullyBlockedDays?.has(dateIso)) continue;

    const openRanges = openByWeekday.get(weekdayFromIsoDate(dateIso));
    if (!openRanges?.length) continue;

    const cutouts: MinuteRange[] = [];
    for (const row of input.blocked) {
      const clipped = clipToDayMinutes(
        new Date(row.starts_at),
        new Date(row.ends_at),
        dateIso,
        input.timeZone,
      );
      if (clipped) cutouts.push(clipped);
    }
    for (const row of input.busy) {
      const clipped = clipToDayMinutes(
        new Date(row.starts_at),
        new Date(new Date(row.ends_at).getTime() + bufferMs),
        dateIso,
        input.timeZone,
      );
      if (clipped) cutouts.push(clipped);
    }

    // Cut everything before the earliest bookable instant (now + min notice).
    const beforeEarliest = clipToDayMinutes(
      new Date(0),
      new Date(earliestMs),
      dateIso,
      input.timeZone,
    );
    if (beforeEarliest) {
      cutouts.push({ start: 0, end: beforeEarliest.end });
    }

    const remaining = openRanges.flatMap((range) =>
      subtractMinuteRanges(range, cutouts),
    );
    if (remaining.some((range) => range.end > range.start)) {
      days.add(dateIso);
    }
  }

  return days;
}
