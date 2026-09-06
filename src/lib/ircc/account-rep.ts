import { decryptProfileRow } from "@/lib/security/profile-pii";

/** Account-level IMM 5476 representative fields (staff profile, not client data). */

export type AccountRepSource = {
  email?: string | null;
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

export const ACCOUNT_REP_ANSWER_KEYS = [
  "repFamilyName",
  "repGivenName",
  "repOrganization",
  "repEmail",
  "repPhone",
  "repPhoneCountryCode",
  "repMembershipId",
  "repStreetNum",
  "repStreetName",
  "repCity",
  "repProvince",
  "repCountry",
  "repPostalCode",
] as const;

export type AccountRepAnswerKey = (typeof ACCOUNT_REP_ANSWER_KEYS)[number];

export type AccountRepFormValues = Record<AccountRepAnswerKey, string>;

export const PROFILE_REP_SELECT =
  "id, email, full_name, rep_family_name, rep_given_name, rep_organization, rep_email, rep_phone, rep_phone_country_code, rep_membership_id, rep_street_num, rep_street_name, rep_city, rep_province, rep_country, rep_postal_code";

function filled(value: string | null | undefined) {
  return String(value ?? "").trim().length > 0;
}

/** Display name on the staff account (not the IMM 5476 block). */
export function isAccountNameComplete(
  profile: AccountRepSource | null | undefined,
): boolean {
  return filled(decryptProfileRow(profile ?? {}).full_name);
}

const REQUIRED_REP_COLUMNS: (keyof AccountRepSource)[] = [
  "rep_family_name",
  "rep_given_name",
  "rep_organization",
  "rep_membership_id",
  "rep_phone",
  "rep_phone_country_code",
  "rep_street_num",
  "rep_street_name",
  "rep_city",
  "rep_province",
  "rep_country",
  "rep_postal_code",
];

/** Form keys that must be filled for IMM 5476 (email may fall back to the account). */
export const ACCOUNT_REP_REQUIRED_FORM_KEYS = [
  "repFamilyName",
  "repGivenName",
  "repOrganization",
  "repMembershipId",
  "repPhone",
  "repPhoneCountryCode",
  "repStreetNum",
  "repStreetName",
  "repCity",
  "repProvince",
  "repCountry",
  "repPostalCode",
] as const;

export type AccountRepRequiredFormKey =
  | (typeof ACCOUNT_REP_REQUIRED_FORM_KEYS)[number]
  | "repEmail";

/** Empty IMM 5476 keys from form values. Pass a fallback email when the account email can stand in. */
export function missingAccountRepFormKeys(
  values: Partial<Record<AccountRepAnswerKey, string | null | undefined>>,
  accountEmail?: string | null,
): AccountRepRequiredFormKey[] {
  const missing: AccountRepRequiredFormKey[] =
    ACCOUNT_REP_REQUIRED_FORM_KEYS.filter((key) => !filled(values[key]));
  if (!filled(values.repEmail) && !filled(accountEmail)) {
    missing.push("repEmail");
  }
  return missing;
}

/** True when IMM 5476 representative fields on the staff profile are filled. */
export function isAccountRepComplete(
  profile: AccountRepSource | null | undefined,
): boolean {
  if (!profile) return false;
  const opened = decryptProfileRow(profile);
  if (!filled(opened.rep_email) && !filled(opened.email)) return false;
  return REQUIRED_REP_COLUMNS.every((key) => filled(opened[key]));
}

/** Display name for a staff representative on client-facing surfaces. */
export function representativeDisplayName(
  profile: AccountRepSource | null | undefined,
): string {
  if (!profile) return "";
  const opened = decryptProfileRow(profile);
  const repName = [opened.rep_given_name, opened.rep_family_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (repName) return repName;
  return String(opened.full_name ?? opened.email ?? "").trim();
}

/** Map profiles.rep_* into questionnaire / PDF answer keys. */
export function accountRepAnswersFromProfile(
  profile: AccountRepSource | null | undefined,
): Record<AccountRepAnswerKey, string> & { hasRepresentative: "Y" } {
  const opened = profile ? decryptProfileRow(profile) : null;
  return {
    hasRepresentative: "Y",
    repFamilyName: opened?.rep_family_name || "",
    repGivenName: opened?.rep_given_name || "",
    repOrganization: opened?.rep_organization || "",
    repEmail: opened?.rep_email || opened?.email || "",
    repPhone: opened?.rep_phone || "",
    repPhoneCountryCode: opened?.rep_phone_country_code || "",
    repMembershipId: opened?.rep_membership_id || "",
    repStreetNum: opened?.rep_street_num || "",
    repStreetName: opened?.rep_street_name || "",
    repCity: opened?.rep_city || "",
    repProvince: opened?.rep_province || "",
    repCountry: opened?.rep_country || "Canada",
    repPostalCode: opened?.rep_postal_code || "",
  };
}

/**
 * Overlay account representative fields onto stored answers.
 * The project's assigned representative profile always wins for IMM 5476.
 */
export function mergeAccountRepIntoAnswers(
  answers: Record<string, unknown>,
  profile: AccountRepSource | null | undefined,
): Record<string, unknown> {
  return {
    ...answers,
    ...accountRepAnswersFromProfile(profile),
  };
}
