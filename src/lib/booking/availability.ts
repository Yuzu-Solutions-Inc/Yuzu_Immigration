import { pad2 } from "@/lib/booking/timezone";

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
