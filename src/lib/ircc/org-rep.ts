/** Org-level IMM 5476 representative fields (not client data). */

export type OrgRepSource = {
  name?: string | null;
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

export const ORG_REP_ANSWER_KEYS = [
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

export type OrgRepAnswerKey = (typeof ORG_REP_ANSWER_KEYS)[number];

/** Map organization.rep_* into questionnaire / PDF answer keys. */
export function orgRepAnswersFromOrg(
  org: OrgRepSource | null | undefined,
): Record<OrgRepAnswerKey, string> & { hasRepresentative: "Y" } {
  return {
    hasRepresentative: "Y",
    repFamilyName: org?.rep_family_name || "",
    repGivenName: org?.rep_given_name || "",
    repOrganization: org?.rep_organization || org?.name || "",
    repEmail: org?.rep_email || "",
    repPhone: org?.rep_phone || "",
    repPhoneCountryCode: org?.rep_phone_country_code || "",
    repMembershipId: org?.rep_membership_id || "",
    repStreetNum: org?.rep_street_num || "",
    repStreetName: org?.rep_street_name || "",
    repCity: org?.rep_city || "",
    repProvince: org?.rep_province || "",
    repCountry: org?.rep_country || "Canada",
    repPostalCode: org?.rep_postal_code || "",
  };
}

/**
 * Overlay firm representative fields from org settings onto stored answers.
 * Org settings always win for IMM 5476 rep block so PDFs stay current.
 */
export function mergeOrgRepIntoAnswers(
  answers: Record<string, unknown>,
  org: OrgRepSource | null | undefined,
): Record<string, unknown> {
  return {
    ...answers,
    ...orgRepAnswersFromOrg(org),
  };
}
