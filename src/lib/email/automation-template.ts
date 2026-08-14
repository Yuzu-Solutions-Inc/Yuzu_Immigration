import {
  addDaysToIsoDate,
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { APP_LOCALES, isAppLocale, toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import type { AutomationLocaleCopy, AutomationTranslations } from "@/lib/booking/types";

export const AUTOMATION_VARIABLES = [
  "customer_name",
  "customer_email",
  "service_name",
  "consultant_name",
  "consultant_email",
  "organization_name",
  "date",
  "time",
  "datetime",
  "timezone",
  "duration",
  "meet_link",
] as const;

export type AutomationVariable = (typeof AUTOMATION_VARIABLES)[number];

export const CUSTOMER_EMAIL_TOKEN = "{{customer_email}}";
export const CONSULTANT_EMAIL_TOKEN = "{{consultant_email}}";

const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAutomationPlain(template: string, vars: Record<string, string>) {
  return template.replace(TOKEN_RE, (_, key: string) => vars[key.toLowerCase()] ?? "");
}

export function renderAutomationHtml(template: string, vars: Record<string, string>) {
  return escapeHtml(template)
    .replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_, key: string) =>
      escapeHtml(vars[key.toLowerCase()] ?? ""),
    )
    .replaceAll("\n", "<br />");
}

export function isAutomationDue(input: {
  startsAt: Date;
  daysBefore: number;
  now: Date;
  timeZone: string;
}) {
  if (input.startsAt.getTime() <= input.now.getTime()) return false;
  const appointmentDate = zonedDateIso(input.startsAt, input.timeZone);
  const today = zonedDateIso(input.now, input.timeZone);
  const sendOn = addDaysToIsoDate(appointmentDate, -input.daysBefore);
  return today >= sendOn;
}

export function automationVariablesFor(input: {
  locale: string;
  timeZone: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  consultantName: string;
  consultantEmail: string;
  organizationName: string;
  startsAt: Date;
  durationMinutes: number;
  meetJoinUrl?: string | null;
  extra?: Record<string, string>;
}): Record<string, string> {
  const locale = toAppLocale(input.locale);
  const meet =
    input.meetJoinUrl?.startsWith("https://") ? input.meetJoinUrl : "";
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    extra[key] = value;
  }
  return {
    ...extra,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    service_name: input.serviceName,
    consultant_name: input.consultantName,
    consultant_email: input.consultantEmail,
    organization_name: input.organizationName,
    date: formatDateInZone(input.startsAt, input.timeZone, locale),
    time: formatTimeInZone(input.startsAt, input.timeZone, locale),
    datetime: formatDateTimeInZone(input.startsAt, input.timeZone, locale),
    timezone: input.timeZone,
    duration: String(input.durationMinutes),
    meet_link: meet,
  };
}

const emailSchema =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAutomationRecipients(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (cleaned.length < 1 || cleaned.length > 10) return null;
  const unique: string[] = [];
  for (const item of cleaned) {
    const ok =
      item === CUSTOMER_EMAIL_TOKEN ||
      item === CONSULTANT_EMAIL_TOKEN ||
      emailSchema.test(item);
    if (!ok) return null;
    if (!unique.includes(item)) unique.push(item);
  }
  return unique.length > 0 ? unique : null;
}

export function hasAutomationCopy(copy?: AutomationLocaleCopy | null) {
  return Boolean(copy?.subject?.trim() && copy?.body?.trim());
}

export function parseAutomationTranslations(
  raw: unknown,
): AutomationTranslations {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const translations: AutomationTranslations = {};
  for (const locale of APP_LOCALES) {
    const entry = (raw as Record<string, unknown>)[locale];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const subject =
      typeof (entry as { subject?: unknown }).subject === "string"
        ? (entry as { subject: string }).subject.trim()
        : "";
    const body =
      typeof (entry as { body?: unknown }).body === "string"
        ? (entry as { body: string }).body.trim()
        : "";
    if (!subject || !body) continue;
    if (subject.length > 200 || body.length > 8000) continue;
    translations[locale] = { subject, body };
  }
  return translations;
}

export function pickAutomationCopy(input: {
  translations: AutomationTranslations | null | undefined;
  fallback: AutomationLocaleCopy;
  preferredLocale?: string | null;
  orgDefaultLocale?: string | null;
}): { copy: AutomationLocaleCopy; locale: AppLocale } {
  const translations = input.translations ?? {};
  const orgDefault = toAppLocale(input.orgDefaultLocale);
  const preferred =
    input.preferredLocale && isAppLocale(input.preferredLocale)
      ? input.preferredLocale
      : null;

  if (preferred && hasAutomationCopy(translations[preferred])) {
    return { copy: translations[preferred]!, locale: preferred };
  }
  if (hasAutomationCopy(translations[orgDefault])) {
    return { copy: translations[orgDefault]!, locale: orgDefault };
  }
  if (hasAutomationCopy(input.fallback)) {
    return { copy: input.fallback, locale: orgDefault };
  }
  for (const locale of APP_LOCALES) {
    if (hasAutomationCopy(translations[locale])) {
      return { copy: translations[locale]!, locale };
    }
  }
  return { copy: input.fallback, locale: orgDefault };
}

export function resolveRecipientAddresses(
  recipients: string[],
  vars: Record<string, string>,
) {
  const addresses: string[] = [];
  for (const recipient of recipients) {
    let email = recipient;
    if (recipient === CUSTOMER_EMAIL_TOKEN) email = vars.customer_email ?? "";
    else if (recipient === CONSULTANT_EMAIL_TOKEN) {
      email = vars.consultant_email ?? "";
    }
    email = email.trim().toLowerCase();
    if (!emailSchema.test(email)) continue;
    if (!addresses.includes(email)) addresses.push(email);
  }
  return addresses;
}
