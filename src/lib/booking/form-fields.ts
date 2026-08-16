import { AUTOMATION_VARIABLES } from "@/lib/email/automation-template";
import type { BookingFormFieldType } from "@/db/schema";
import type { BookingFormFieldRow } from "@/lib/booking/types";
import {
  flattenCompositeAnswer,
  inferCompositeFieldType,
  isCompositeFieldType,
  parseAddressFromForm,
  parsePassportFromForm,
  parsePhoneContactFromForm,
  validateCompositeAnswer,
} from "@/lib/booking/composite-fields";

export const BOOKING_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "checkbox",
  "address",
  "phone_contact",
  "passport",
] as const satisfies readonly BookingFormFieldType[];

export const MAX_BOOKING_FORM_FIELDS = 20;
export const FORM_FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

const RESERVED_FIELD_KEYS = new Set<string>([
  ...AUTOMATION_VARIABLES,
  "name",
  "email",
  "phone",
  "address",
  "first_name",
  "last_name",
  "preferred_language",
  "guest_name",
  "guest_email",
  "guest_phone",
  "guest_address",
  "guest_first_name",
  "guest_last_name",
  "guest_preferred_locale",
]);

export function isReservedBookingFieldKey(key: string) {
  return RESERVED_FIELD_KEYS.has(key);
}

export type BookingFormPresetField = {
  fieldKey: string;
  labelKey: string;
  fieldType: BookingFormFieldType;
  required: boolean;
  optionsKey?: string;
};

export type BookingFormPreset = {
  id: string;
  labelKey: string;
  fields: BookingFormPresetField[];
};

export const BOOKING_FORM_PRESETS: BookingFormPreset[] = [
  {
    id: "address",
    labelKey: "formPresetAddress",
    fields: [
      {
        fieldKey: "mailing_address",
        labelKey: "formFieldAddress",
        fieldType: "address",
        required: true,
      },
    ],
  },
  {
    id: "phone_contact",
    labelKey: "formPresetPhone",
    fields: [
      {
        fieldKey: "contact_phone",
        labelKey: "formFieldPhoneContact",
        fieldType: "phone_contact",
        required: false,
      },
    ],
  },
  {
    id: "date_of_birth",
    labelKey: "formPresetDob",
    fields: [
      {
        fieldKey: "date_of_birth",
        labelKey: "formFieldDob",
        fieldType: "date",
        required: true,
      },
    ],
  },
  {
    id: "citizenship",
    labelKey: "formPresetCitizenship",
    fields: [
      {
        fieldKey: "country_of_citizenship",
        labelKey: "formFieldCitizenship",
        fieldType: "text",
        required: true,
      },
    ],
  },
  {
    id: "immigration_status",
    labelKey: "formPresetStatus",
    fields: [
      {
        fieldKey: "immigration_status",
        labelKey: "formFieldStatus",
        fieldType: "select",
        required: true,
        optionsKey: "formOptionsStatus",
      },
    ],
  },
  {
    id: "immigration_status",
    labelKey: "formPresetUci",
    fields: [
      {
        fieldKey: "uci_number",
        labelKey: "formFieldUci",
        fieldType: "text",
        required: false,
      },
    ],
  },
  {
    id: "employer_name",
    labelKey: "formPresetEmployer",
    fields: [
      {
        fieldKey: "employer_name",
        labelKey: "formFieldEmployer",
        fieldType: "text",
        required: false,
      },
    ],
  },
  {
    id: "family_members",
    labelKey: "formPresetFamily",
    fields: [
      {
        fieldKey: "family_members",
        labelKey: "formFieldFamily",
        fieldType: "number",
        required: false,
      },
    ],
  },
  {
    id: "consultation_topic",
    labelKey: "formPresetTopic",
    fields: [
      {
        fieldKey: "consultation_topic",
        labelKey: "formFieldTopic",
        fieldType: "textarea",
        required: false,
      },
    ],
  },
  {
    id: "referral_source",
    labelKey: "formPresetReferral",
    fields: [
      {
        fieldKey: "referral_source",
        labelKey: "formFieldReferral",
        fieldType: "select",
        required: false,
        optionsKey: "formOptionsReferral",
      },
    ],
  },
];

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
    if (isCompositeFieldType(field.field_type)) {
      let json = "";
      switch (field.field_type) {
        case "address":
          json = JSON.stringify(parseAddressFromForm(formData, field.field_key));
          break;
        case "phone_contact":
          json = JSON.stringify(
            parsePhoneContactFromForm(formData, field.field_key),
          );
          break;
        case "passport":
          json = JSON.stringify(parsePassportFromForm(formData, field.field_key));
          break;
      }
      if (
        !validateCompositeAnswer(field.field_type, json, field.required)
      ) {
        return { ok: false };
      }
      const parsed = JSON.parse(json) as Record<string, string>;
      const hasValue = Object.values(parsed).some((value) => value.length > 0);
      if (hasValue) answers[field.field_key] = json;
      continue;
    }

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
    const composite = inferCompositeFieldType(value);
    if (composite) {
      const flat = flattenCompositeAnswer(key, composite, value);
      for (const [flatKey, flatValue] of Object.entries(flat)) {
        extra[flatKey] = flatValue.slice(0, 2000);
      }
      continue;
    }
    extra[key] = value.slice(0, 2000);
  }
  return extra;
}
