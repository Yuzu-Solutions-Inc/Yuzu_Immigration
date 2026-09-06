import { requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import {
  decryptFieldMaybe,
  encryptField,
  encryptOptionalField,
  isEncryptedField,
} from "@/lib/security/field-crypto";

/**
 * Staff profile PII is user-scoped (a person can belong to several orgs),
 * so it uses the platform wrap key rather than an org DEK.
 */
export const PROFILE_AAD = {
  fullName: "profiles.full_name",
  repFamilyName: "profiles.rep_family_name",
  repGivenName: "profiles.rep_given_name",
  repOrganization: "profiles.rep_organization",
  repEmail: "profiles.rep_email",
  repPhone: "profiles.rep_phone",
  repPhoneCountryCode: "profiles.rep_phone_country_code",
  repMembershipId: "profiles.rep_membership_id",
  repStreetNum: "profiles.rep_street_num",
  repStreetName: "profiles.rep_street_name",
  repCity: "profiles.rep_city",
  repProvince: "profiles.rep_province",
  repCountry: "profiles.rep_country",
  repPostalCode: "profiles.rep_postal_code",
} as const;

export type ProfilePii = {
  full_name?: string | null;
  rep_family_name?: string | null;
  rep_given_name?: string | null;
  rep_organization?: string | null;
  rep_email?: string | null;
  rep_phone?: string | null;
  rep_phone_country_code?: string | null;
  rep_membership_id?: string | null;
  rep_street_num?: string | null;
  rep_street_name?: string | null;
  rep_city?: string | null;
  rep_province?: string | null;
  rep_country?: string | null;
  rep_postal_code?: string | null;
};

const OPTIONAL_PROFILE_FIELDS = [
  ["rep_family_name", PROFILE_AAD.repFamilyName],
  ["rep_given_name", PROFILE_AAD.repGivenName],
  ["rep_organization", PROFILE_AAD.repOrganization],
  ["rep_email", PROFILE_AAD.repEmail],
  ["rep_phone", PROFILE_AAD.repPhone],
  ["rep_phone_country_code", PROFILE_AAD.repPhoneCountryCode],
  ["rep_membership_id", PROFILE_AAD.repMembershipId],
  ["rep_street_num", PROFILE_AAD.repStreetNum],
  ["rep_street_name", PROFILE_AAD.repStreetName],
  ["rep_city", PROFILE_AAD.repCity],
  ["rep_province", PROFILE_AAD.repProvince],
  ["rep_country", PROFILE_AAD.repCountry],
  ["rep_postal_code", PROFILE_AAD.repPostalCode],
] as const;

export function encryptProfileWrite(
  input: ProfilePii,
  key: Buffer = requireAppEncryptionKey(),
): ProfilePii {
  const out: ProfilePii = {};
  if (input.full_name !== undefined) {
    const trimmed = input.full_name?.trim() ?? "";
    out.full_name = trimmed
      ? encryptField(trimmed, PROFILE_AAD.fullName, key)
      : input.full_name;
  }
  for (const [column, aad] of OPTIONAL_PROFILE_FIELDS) {
    if (!(column in input)) continue;
    const value = input[column];
    if (typeof value === "string" && isEncryptedField(value)) {
      out[column] = value;
      continue;
    }
    out[column] = encryptOptionalField(value, aad, key);
  }
  return out;
}

export function decryptProfileRow<T extends ProfilePii>(
  row: T,
  key: Buffer = requireAppEncryptionKey(),
): T {
  const out: Record<string, unknown> = { ...row };
  if ("full_name" in row) {
    out.full_name = decryptFieldMaybe(row.full_name, PROFILE_AAD.fullName, key);
  }
  for (const [column, aad] of OPTIONAL_PROFILE_FIELDS) {
    if (!(column in row)) continue;
    out[column] = decryptFieldMaybe(row[column], aad, key);
  }
  return out as T;
}

export function decryptProfileRows<T extends ProfilePii>(rows: T[]): T[] {
  return rows.map((row) => decryptProfileRow(row));
}
