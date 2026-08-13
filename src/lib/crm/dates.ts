import { todayDateInputValue } from "@/lib/crm/statuses";

export function isoDateOnly(value: string) {
  return value.slice(0, 10);
}

export function daysUntilIso(isoDate: string, from = new Date()) {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDateOnly(isoDate)}T12:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function addDaysIso(days: number, from = new Date()) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return todayDateInputValue(date);
}

/** Monday of the ISO week containing `from`. */
export function startOfIsoWeek(from = new Date()) {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return todayDateInputValue(date);
}

export function shiftIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDateOnly(isoDate)}T12:00:00`);
  date.setDate(date.getDate() + days);
  return todayDateInputValue(date);
}

export function formatDisplayDate(isoDate: string, locale: string) {
  return new Date(`${isoDateOnly(isoDate)}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}
