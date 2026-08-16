import {
  CANONICAL_FIELDS,
  type CanonicalField,
} from "@/lib/ircc/fields";

export const MAILING_ADDRESS_FIELD_KEYS = [
  "streetNum",
  "streetName",
  "aptUnit",
  "city",
  "provinceState",
  "country",
  "postalCode",
] as const;

export const PHONE_CONTACT_FIELD_KEYS = [
  "phoneCountryCode",
  "phone",
  "phoneType",
] as const;

export const PASSPORT_FIELD_KEYS = [
  "passportCountry",
  "passportNumber",
] as const;

export type MailingAddressFieldKey = (typeof MAILING_ADDRESS_FIELD_KEYS)[number];
export type PhoneContactFieldKey = (typeof PHONE_CONTACT_FIELD_KEYS)[number];
export type PassportFieldKey = (typeof PASSPORT_FIELD_KEYS)[number];

export function canonicalFieldsByKeys(
  keys: readonly string[],
): CanonicalField[] {
  const byKey = new Map(CANONICAL_FIELDS.map((field) => [field.key, field]));
  return keys
    .map((key) => byKey.get(key))
    .filter((field): field is CanonicalField => Boolean(field));
}

export function contactFieldInlineClass(key: string) {
  if (key === "phoneCountryCode") return "w-[5.25rem] shrink-0";
  if (key === "phoneType") return "w-[10.5rem] shrink-0";
  return "min-w-0 flex-1";
}

export function contactFieldGridSpan(key: string) {
  if (
    key === "streetName" ||
    key === "resStreetName" ||
    key.endsWith("StreetName")
  ) {
    return "sm:col-span-2";
  }
  return undefined;
}

export function contactFieldLabel(
  key: string,
  t: (key: string) => string,
): string {
  if (key === "phoneCountryCode") return t("fields.phoneCode");
  if (key === "phone") return t("fields.phoneNumber");
  if (key === "phoneType") return t("fields.phoneKind");
  if (key === "streetNum" || key.endsWith("StreetNum")) return t("fields.streetNum");
  if (key === "streetName" || key.endsWith("StreetName")) return t("fields.streetName");
  if (key === "aptUnit" || key.endsWith("AptUnit")) return t("fields.aptUnit");
  if (key === "postalCode" || key.endsWith("PostalCode")) return t("fields.postalCode");
  if (key === "city" || key.endsWith("City")) return t("tables.columns.colCity");
  if (key === "provinceState" || key.endsWith("ProvinceState")) {
    return t("tables.columns.colProvince");
  }
  if (key === "country" || key.endsWith("Country")) {
    return t("tables.columns.colCountry");
  }
  if (key === "passportNumber") return t("fields.passportNumber");
  if (key === "passportCountry") return t("fields.passportCountry");
  return t(`fields.${key}`);
}
