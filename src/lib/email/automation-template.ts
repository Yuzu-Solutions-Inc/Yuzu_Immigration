import {
  addDaysToIsoDate,
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  zonedDateIso,
} from "@/lib/booking/timezone";
import { toAppLocale } from "@/lib/i18n/locales";

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

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

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
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) =>
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
}): Record<string, string> {
  const locale = toAppLocale(input.locale);
  const meet =
    input.meetJoinUrl?.startsWith("https://") ? input.meetJoinUrl : "";
  return {
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
