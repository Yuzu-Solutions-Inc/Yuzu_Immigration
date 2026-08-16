import type { BookingFormFieldType } from "@/db/schema";
import {
  MAILING_ADDRESS_FIELD_KEYS,
  PASSPORT_FIELD_KEYS,
  PHONE_CONTACT_FIELD_KEYS,
} from "@/lib/forms/contact-fields";
import {
  QUESTIONNAIRE_LOVS,
} from "@/lib/ircc/fields";

export const COMPOSITE_FIELD_TYPES = [
  "address",
  "phone_contact",
  "passport",
] as const satisfies readonly BookingFormFieldType[];

export type CompositeFieldType = (typeof COMPOSITE_FIELD_TYPES)[number];

export function isCompositeFieldType(
  type: BookingFormFieldType,
): type is CompositeFieldType {
  return (COMPOSITE_FIELD_TYPES as readonly string[]).includes(type);
}

export type AddressAnswer = Record<(typeof MAILING_ADDRESS_FIELD_KEYS)[number], string>;
export type PhoneContactAnswer = Record<(typeof PHONE_CONTACT_FIELD_KEYS)[number], string>;
export type PassportAnswer = Record<(typeof PASSPORT_FIELD_KEYS)[number], string>;

const countryCodes = new Set(QUESTIONNAIRE_LOVS.country.map((opt) => opt.value));
const phoneTypes = new Set(QUESTIONNAIRE_LOVS.phone.map((opt) => opt.value));

export function compositeSubInputName(fieldKey: string, subKey: string) {
  return `custom_${fieldKey}__${subKey}`;
}

export function parseCompositeValue<T extends Record<string, string>>(
  raw: string | undefined,
): T | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function readSubValue(formData: FormData, fieldKey: string, subKey: string) {
  return String(
    formData.get(compositeSubInputName(fieldKey, subKey)) ?? "",
  ).trim();
}

function readGroupFromForm(
  formData: FormData,
  fieldKey: string,
  keys: readonly string[],
) {
  const out: Record<string, string> = {};
  for (const subKey of keys) {
    out[subKey] = readSubValue(formData, fieldKey, subKey);
  }
  return out;
}

export function parseAddressFromForm(
  formData: FormData,
  fieldKey: string,
): AddressAnswer {
  return readGroupFromForm(
    formData,
    fieldKey,
    MAILING_ADDRESS_FIELD_KEYS,
  ) as AddressAnswer;
}

export function parsePhoneContactFromForm(
  formData: FormData,
  fieldKey: string,
): PhoneContactAnswer {
  return readGroupFromForm(
    formData,
    fieldKey,
    PHONE_CONTACT_FIELD_KEYS,
  ) as PhoneContactAnswer;
}

export function parsePassportFromForm(
  formData: FormData,
  fieldKey: string,
): PassportAnswer {
  return readGroupFromForm(
    formData,
    fieldKey,
    PASSPORT_FIELD_KEYS,
  ) as PassportAnswer;
}

function hasAnyValue(values: Record<string, string>) {
  return Object.values(values).some((value) => value.length > 0);
}

function countryLabel(code: string, locale = "en") {
  const opt = QUESTIONNAIRE_LOVS.country.find((row) => row.value === code);
  if (!opt) return code;
  if (locale.startsWith("fr") && opt.labelFr) return opt.labelFr;
  return opt.label ?? code;
}

function phoneTypeLabel(code: string, locale = "en") {
  const opt = QUESTIONNAIRE_LOVS.phone.find((row) => row.value === code);
  if (!opt) return code;
  if (locale.startsWith("fr") && opt.labelFr) return opt.labelFr;
  return opt.label ?? code;
}

function validAddress(answer: AddressAnswer, required: boolean) {
  if (!hasAnyValue(answer)) return !required;
  if (!answer.streetNum || answer.streetNum.length > 20) return false;
  if (!answer.streetName || answer.streetName.length > 80) return false;
  if (answer.aptUnit.length > 20) return false;
  if (!answer.city || answer.city.length > 80) return false;
  if (answer.provinceState.length > 40) return false;
  if (!answer.country || !countryCodes.has(answer.country)) return false;
  if (!answer.postalCode || answer.postalCode.length > 20) return false;
  return true;
}

function validPhoneContact(answer: PhoneContactAnswer, required: boolean) {
  if (!hasAnyValue(answer)) return !required;
  if (!answer.phoneCountryCode || answer.phoneCountryCode.length > 6) return false;
  if (
    !answer.phone ||
    answer.phone.length < 6 ||
    answer.phone.length > 40
  ) {
    return false;
  }
  if (answer.phoneType && !phoneTypes.has(answer.phoneType)) return false;
  return true;
}

function validPassport(answer: PassportAnswer, required: boolean) {
  if (!hasAnyValue(answer)) return !required;
  if (!answer.passportCountry || !countryCodes.has(answer.passportCountry)) {
    return false;
  }
  if (
    !answer.passportNumber ||
    answer.passportNumber.length < 3 ||
    answer.passportNumber.length > 40
  ) {
    return false;
  }
  return true;
}

export function validateCompositeAnswer(
  fieldType: CompositeFieldType,
  rawJson: string,
  required: boolean,
): boolean {
  switch (fieldType) {
    case "address":
      return validAddress(
        parseCompositeValue<AddressAnswer>(rawJson) ??
          Object.fromEntries(
            MAILING_ADDRESS_FIELD_KEYS.map((key) => [key, ""]),
          ) as AddressAnswer,
        required,
      );
    case "phone_contact":
      return validPhoneContact(
        parseCompositeValue<PhoneContactAnswer>(rawJson) ??
          Object.fromEntries(
            PHONE_CONTACT_FIELD_KEYS.map((key) => [key, ""]),
          ) as PhoneContactAnswer,
        required,
      );
    case "passport":
      return validPassport(
        parseCompositeValue<PassportAnswer>(rawJson) ??
          Object.fromEntries(
            PASSPORT_FIELD_KEYS.map((key) => [key, ""]),
          ) as PassportAnswer,
        required,
      );
    default:
      return false;
  }
}

export function formatCompositeAnswer(
  fieldType: BookingFormFieldType,
  raw: string,
  locale = "en",
): string {
  switch (fieldType) {
    case "address": {
      const value = parseCompositeValue<AddressAnswer>(raw);
      if (!value) return raw;
      return [
        value.streetNum,
        value.streetName,
        value.aptUnit,
        value.city,
        value.provinceState,
        countryLabel(value.country, locale),
        value.postalCode,
      ]
        .filter(Boolean)
        .join(", ");
    }
    case "phone_contact": {
      const value = parseCompositeValue<PhoneContactAnswer>(raw);
      if (!value) return raw;
      const typeLabel = value.phoneType
        ? ` (${phoneTypeLabel(value.phoneType, locale)})`
        : "";
      const prefix = value.phoneCountryCode
        ? `+${value.phoneCountryCode.replace(/\D/g, "")} `
        : "";
      return `${prefix}${value.phone}${typeLabel}`.trim();
    }
    case "passport": {
      const value = parseCompositeValue<PassportAnswer>(raw);
      if (!value) return raw;
      return `${countryLabel(value.passportCountry, locale)} — ${value.passportNumber}`;
    }
    default:
      return raw;
  }
}

export function flattenCompositeAnswer(
  fieldKey: string,
  fieldType: BookingFormFieldType,
  raw: string,
): Record<string, string> {
  const flat: Record<string, string> = {
    [fieldKey]: formatCompositeAnswer(fieldType, raw),
  };
  const parsed = parseCompositeValue<Record<string, string>>(raw);
  if (!parsed) return flat;
  for (const [subKey, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value) continue;
    flat[`${fieldKey}_${subKey}`] = value.slice(0, 500);
  }
  return flat;
}

export function inferCompositeFieldType(
  value: string,
): CompositeFieldType | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if ("streetNum" in record) return "address";
    if ("passportNumber" in record) return "passport";
    if ("phoneCountryCode" in record) return "phone_contact";
    return null;
  } catch {
    return null;
  }
}
