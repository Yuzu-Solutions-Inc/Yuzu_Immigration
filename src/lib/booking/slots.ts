import {
  addDaysToIsoDate,
  hmFromMinutes,
  minutesFromHm,
  weekdayFromIsoDate,
  zonedCivilToUtc,
  zonedDateIso,
} from "@/lib/booking/timezone";

export type AvailabilityRule = {
  weekday: number;
  start_time: string;
  end_time: string;
};

export type BusyInterval = {
  starts_at: string;
  ends_at: string;
};

export type SlotWindow = {
  timezone: string;
  bookingWindowDays: number;
  minNoticeHours: number;
  bufferMinutes: number;
};

export type GeneratedSlot = {
  startsAt: string;
  endsAt: string;
  dateIso: string;
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function expandBusyWithBuffer(
  intervals: BusyInterval[],
  bufferMinutes: number,
): { start: number; end: number }[] {
  const bufferMs = bufferMinutes * 60_000;
  return intervals.map((interval) => {
    const start = new Date(interval.starts_at).getTime();
    const end = new Date(interval.ends_at).getTime() + bufferMs;
    return { start, end };
  });
}

export function listCivilDatesInWindow(
  timezone: string,
  windowDays: number,
  from = new Date(),
) {
  const startIso = zonedDateIso(from, timezone);
  const dates: string[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    dates.push(addDaysToIsoDate(startIso, i));
  }
  return dates;
}

export function generateServiceSlots(input: {
  durationMinutes: number;
  rules: AvailabilityRule[];
  blocked: BusyInterval[];
  busy: BusyInterval[];
  window: SlotWindow;
  from?: Date;
}): GeneratedSlot[] {
  const now = input.from ?? new Date();
  const earliest = now.getTime() + input.window.minNoticeHours * 3_600_000;
  const busy = [
    ...expandBusyWithBuffer(input.busy, input.window.bufferMinutes),
    ...expandBusyWithBuffer(input.blocked, 0),
  ];
  const dates = listCivilDatesInWindow(
    input.window.timezone,
    input.window.bookingWindowDays,
    now,
  );
  const slots: GeneratedSlot[] = [];

  for (const dateIso of dates) {
    const weekday = weekdayFromIsoDate(dateIso);
    const dayRules = input.rules.filter((rule) => rule.weekday === weekday);
    for (const rule of dayRules) {
      const startMin = minutesFromHm(rule.start_time);
      const endMin = minutesFromHm(rule.end_time);
      for (
        let cursor = startMin;
        cursor + input.durationMinutes <= endMin;
        cursor += input.durationMinutes
      ) {
        const startHm = hmFromMinutes(cursor);
        const endHm = hmFromMinutes(cursor + input.durationMinutes);
        const startsAt = zonedCivilToUtc(dateIso, startHm, input.window.timezone);
        const endsAt = zonedCivilToUtc(dateIso, endHm, input.window.timezone);
        if (startsAt.getTime() < earliest) continue;
        const startMs = startsAt.getTime();
        const endMs = endsAt.getTime();
        const taken = busy.some((interval) =>
          overlaps(startMs, endMs, interval.start, interval.end),
        );
        if (taken) continue;
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          dateIso,
        });
      }
    }
  }

  return slots;
}

export function isSlotStillOpen(input: {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  rules: AvailabilityRule[];
  blocked: BusyInterval[];
  busy: BusyInterval[];
  window: SlotWindow;
  from?: Date;
}) {
  const expected = generateServiceSlots({
    durationMinutes: input.durationMinutes,
    rules: input.rules,
    blocked: input.blocked,
    busy: input.busy,
    window: input.window,
    from: input.from,
  });
  return expected.some(
    (slot) =>
      slot.startsAt === input.startsAt && slot.endsAt === input.endsAt,
  );
}

const DAY_MINUTES = 24 * 60;

/** Slots around the clock except blocked time, existing bookings, and calendar busy. */
export function generateUnblockedServiceSlots(input: {
  durationMinutes: number;
  blocked: BusyInterval[];
  busy: BusyInterval[];
  window: SlotWindow;
  from?: Date;
}): GeneratedSlot[] {
  const now = input.from ?? new Date();
  const earliest = now.getTime() + input.window.minNoticeHours * 3_600_000;
  const durationMs = input.durationMinutes * 60_000;
  const busy = [
    ...expandBusyWithBuffer(input.busy, input.window.bufferMinutes),
    ...expandBusyWithBuffer(input.blocked, 0),
  ];
  const dates = listCivilDatesInWindow(
    input.window.timezone,
    input.window.bookingWindowDays,
    now,
  );
  const slots: GeneratedSlot[] = [];
  const step = Math.max(5, input.durationMinutes);

  for (const dateIso of dates) {
    for (let cursor = 0; cursor < DAY_MINUTES; cursor += step) {
      const startHm = hmFromMinutes(cursor);
      const startsAt = zonedCivilToUtc(dateIso, startHm, input.window.timezone);
      if (startsAt.getTime() < earliest) continue;
      const endsAt = new Date(startsAt.getTime() + durationMs);
      const startMs = startsAt.getTime();
      const endMs = endsAt.getTime();
      const taken = busy.some((interval) =>
        overlaps(startMs, endMs, interval.start, interval.end),
      );
      if (taken) continue;
      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        dateIso,
      });
    }
  }

  return slots;
}

export function isUnblockedSlotStillOpen(input: {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  blocked: BusyInterval[];
  busy: BusyInterval[];
  window: SlotWindow;
  from?: Date;
}) {
  const expected = generateUnblockedServiceSlots({
    durationMinutes: input.durationMinutes,
    blocked: input.blocked,
    busy: input.busy,
    window: input.window,
    from: input.from,
  });
  return expected.some(
    (slot) =>
      slot.startsAt === input.startsAt && slot.endsAt === input.endsAt,
  );
}

export function formatPriceCents(
  cents: number,
  locale: string,
  currency = "CAD",
) {
  return new Intl.NumberFormat(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es" : "en-CA",
    { style: "currency", currency },
  ).format(cents / 100);
}

export function parsePriceToCents(raw: string) {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function centsToPriceInput(cents: number) {
  return (cents / 100).toFixed(2);
}
