export const BOOKING_TIMEZONES = [
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Whitehorse",
  "America/Yellowknife",
  "America/Iqaluit",
  "UTC",
] as const;

export type BookingTimezone = (typeof BOOKING_TIMEZONES)[number];

export function isBookingTimezone(value: string): value is BookingTimezone {
  return (BOOKING_TIMEZONES as readonly string[]).includes(value);
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isoDateFromParts(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Weekday of a civil YYYY-MM-DD date. 0 = Sunday. */
export function weekdayFromIsoDate(dateIso: string) {
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

export function addDaysToIsoDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDateFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function zonedDateIso(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return isoDateFromParts(parts.year, parts.month, parts.day);
}

/**
 * Convert a civil date + HH:MM in `timeZone` to a UTC Date.
 * Iteratively corrects for the zone offset, including DST.
 */
export function zonedCivilToUtc(
  dateIso: string,
  timeHm: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = normalizeTimeHm(timeHm).split(":").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wanted;
  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
    );
    utc += wanted - asUtc;
  }
  return new Date(utc);
}

export function normalizeTimeHm(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

export function minutesFromHm(value: string) {
  const [hour, minute] = normalizeTimeHm(value).split(":").map(Number);
  return hour * 60 + minute;
}

export function hmFromMinutes(total: number) {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

const DAY_MINUTES = 24 * 60;

/**
 * Clip an interval to a civil day and return start/end as minutes from 00:00
 * in `timeZone`. End-of-day is 1440. Returns null when there is no overlap.
 */
export function clipToDayMinutes(
  startsAt: Date,
  endsAt: Date,
  dateIso: string,
  timeZone: string,
): { start: number; end: number } | null {
  const dayStart = zonedCivilToUtc(dateIso, "00:00", timeZone);
  const dayEnd = zonedCivilToUtc(addDaysToIsoDate(dateIso, 1), "00:00", timeZone);
  const startMs = Math.max(startsAt.getTime(), dayStart.getTime());
  const endMs = Math.min(endsAt.getTime(), dayEnd.getTime());
  if (endMs <= startMs) return null;

  const toMinutes = (ms: number) => {
    if (ms <= dayStart.getTime()) return 0;
    if (ms >= dayEnd.getTime()) return DAY_MINUTES;
    const parts = zonedParts(new Date(ms), timeZone);
    return parts.hour * 60 + parts.minute;
  };

  const start = toMinutes(startMs);
  const end = toMinutes(endMs);
  if (end <= start) return null;
  return { start, end };
}

export function coversCivilDay(
  startsAt: Date,
  endsAt: Date,
  dateIso: string,
  timeZone: string,
) {
  const dayStart = zonedCivilToUtc(dateIso, "00:00", timeZone).getTime();
  const dayEnd = zonedCivilToUtc(
    addDaysToIsoDate(dateIso, 1),
    "00:00",
    timeZone,
  ).getTime();
  return startsAt.getTime() <= dayStart && endsAt.getTime() >= dayEnd;
}

export function formatDateInZone(
  date: Date,
  timeZone: string,
  locale: string,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimeInZone(
  date: Date,
  timeZone: string,
  locale: string,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTimeInZone(
  date: Date,
  timeZone: string,
  locale: string,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMonthYear(year: number, month: number, locale: string) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 1, 12)));
}

export function intlLocale(locale: string) {
  if (locale === "fr") return "fr-CA";
  if (locale === "es") return "es-CA";
  return "en-CA";
}

export type MonthCell = {
  dateIso: string;
  inMonth: boolean;
};

export function monthGrid(
  year: number,
  monthIndex: number,
  weekStartsOn: 0 | 1,
): MonthCell[] {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1, 12)).getUTCDay();
  const lead = (firstWeekday - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < total; i += 1) {
    const day = i - lead + 1;
    const date = new Date(Date.UTC(year, monthIndex, day, 12));
    cells.push({
      dateIso: isoDateFromParts(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      ),
      inMonth: date.getUTCMonth() === monthIndex,
    });
  }
  return cells;
}

export function weekStartsOn(locale: string): 0 | 1 {
  return locale === "en" ? 0 : 1;
}
