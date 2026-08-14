import { AUTOMATION_VARIABLES } from "@/lib/email/automation-template";
import type { BookingFormFieldType } from "@/db/schema";
import type { BookingFormFieldRow } from "@/lib/booking/types";

export const BOOKING_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "checkbox",
] as const satisfies readonly BookingFormFieldType[];

export const MAX_BOOKING_FORM_FIELDS = 20;
export const FORM_FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const RESERVED_FIELD_KEYS = new Set<string>([
  ...AUTOMATION_VARIABLES,
  "name",
  "email",
  "phone",
  "address",
  "guest_name",
  "guest_email",
  "guest_phone",
  "guest_address",
]);

export function isReservedBookingFieldKey(key: string) {
  return RESERVED_FIELD_KEYS.has(key);
}

export function slugFromFieldLabel(label: string) {
  const slug = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug) return "field";
  if (!/^[a-z]/.test(slug)) return `field_${slug}`.slice(0, 40);
  return slug;
}

export function parseSelectOptions(raw: string) {
  const options = raw
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
  const unique: string[] = [];
  for (const option of options) {
    if (option.length > 80) continue;
    if (!unique.includes(option)) unique.push(option);
  }
  return unique;
}

export function formFieldInputName(fieldKey: string) {
  return `custom_${fieldKey}`;
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string) {
  if (!dateRe.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

export function parseBookingFormAnswers(
  formData: FormData,
  fields: BookingFormFieldRow[],
): { ok: true; answers: Record<string, string> } | { ok: false } {
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const raw = String(formData.get(formFieldInputName(field.field_key)) ?? "");
    if (field.field_type === "checkbox") {
      const checked = raw === "on" || raw === "true";
      if (field.required && !checked) return { ok: false };
      answers[field.field_key] = checked ? "true" : "false";
      continue;
    }
    const value = raw.trim();
    if (!value) {
      if (field.required) return { ok: false };
      continue;
    }
    switch (field.field_type) {
      case "text":
        if (value.length > 300) return { ok: false };
        break;
      case "textarea":
        if (value.length > 2000) return { ok: false };
        break;
      case "email":
        if (!emailRe.test(value) || value.length > 160) return { ok: false };
        break;
      case "phone":
        if (value.length < 6 || value.length > 40) return { ok: false };
        break;
      case "number": {
        if (value.length > 20) return { ok: false };
        const n = Number(value);
        if (!Number.isFinite(n) || Math.abs(n) > 1e12) return { ok: false };
        break;
      }
      case "date":
        if (!validDate(value)) return { ok: false };
        break;
      case "select":
        if (!field.options.includes(value)) return { ok: false };
        break;
      default:
        return { ok: false };
    }
    answers[field.field_key] = value;
  }
  return { ok: true, answers };
}

export function extraAutomationVariables(
  answers: Record<string, string> | null | undefined,
) {
  const extra: Record<string, string> = {};
  if (!answers) return extra;
  for (const [key, value] of Object.entries(answers)) {
    if (!FORM_FIELD_KEY_RE.test(key) || isReservedBookingFieldKey(key)) continue;
    if (typeof value !== "string") continue;
    extra[key] = value.slice(0, 2000);
  }
  return extra;
}
