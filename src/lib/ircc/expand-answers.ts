/**
 * Expand questionnaire answers into the shapes IRCC fillers expect.
 */

import { expandDobAnswers } from "./fields";

function splitIsoDate(value: unknown): {
  year?: string;
  month?: string;
  day?: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!m) return {};
  return { year: m[1], month: m[2], day: m[3] };
}

function splitMonth(value: unknown): { year?: string; month?: string } {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})$/.exec(raw);
  if (iso) return { year: iso[1], month: iso[2] };
  const d = splitIsoDate(raw);
  if (d.year && d.month) return { year: d.year, month: d.month };
  return {};
}

function yn(value: unknown, fallback: "Y" | "N" = "N"): "Y" | "N" {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "TRUE" || v === "1") return "Y";
  if (v === "N" || v === "NO" || v === "FALSE" || v === "0") return "N";
  return fallback;
}

function expandPrefixedDate(
  out: Record<string, unknown>,
  prefix: string,
  isoKey: string,
) {
  const parts = splitIsoDate(out[isoKey] ?? out[prefix]);
  if (parts.year) {
    out[`${prefix}Year`] = parts.year;
    out[`${prefix}Month`] = parts.month;
    out[`${prefix}Day`] = parts.day;
  }
}

function mapCorRow(row: Record<string, unknown>) {
  const from = splitIsoDate(row.from);
  const to = splitIsoDate(row.to);
  return {
    country: String(row.country || ""),
    status: String(row.status || ""),
    other: String(row.other || "") || undefined,
    fromYear: String(row.fromYear || from.year || ""),
    fromMonth: String(row.fromMonth || from.month || ""),
    fromDay: String(row.fromDay || from.day || ""),
    toYear: String(row.toYear || to.year || ""),
    toMonth: String(row.toMonth || to.month || ""),
    toDay: String(row.toDay || to.day || ""),
  };
}

function mapJobRow(row: Record<string, unknown>) {
  const from = splitMonth(row.from);
  const to = splitMonth(row.to);
  return {
    occupation: String(row.occupation || ""),
    employer: String(row.employer || ""),
    city: String(row.city || ""),
    country: String(row.country || ""),
    provinceState: String(row.provinceState || "") || undefined,
    fromYear: String(row.fromYear || from.year || ""),
    fromMonth: String(row.fromMonth || from.month || ""),
    toYear: String(row.toYear || to.year || "") || undefined,
    toMonth: String(row.toMonth || to.month || "") || undefined,
  };
}

function mapEducationRow(row: Record<string, unknown>) {
  const from = splitMonth(row.from);
  const to = splitMonth(row.to);
  return {
    school: String(row.school || ""),
    fieldOfStudy: String(row.fieldOfStudy || ""),
    city: String(row.city || ""),
    country: String(row.country || ""),
    provinceState: String(row.provinceState || "") || undefined,
    fromYear: String(row.fromYear || from.year || ""),
    fromMonth: String(row.fromMonth || from.month || ""),
    toYear: String(row.toYear || to.year || ""),
    toMonth: String(row.toMonth || to.month || ""),
  };
}

function langFromFormLanguage(formLanguage: unknown): {
  ableToCommunicate: string;
  preferredLang: string;
  serviceIn: string;
} {
  const french = String(formLanguage || "")
    .toLowerCase()
    .startsWith("f");
  const lang = french ? "French" : "English";
  return {
    ableToCommunicate: lang,
    preferredLang: lang,
    serviceIn: lang,
  };
}

/** Build the full answer bag used by primary + companion fillers. */
export function expandAnswersForFill(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ...expandDobAnswers(raw),
  };

  const derived = langFromFormLanguage(out.formLanguage);
  if (!out.ableToCommunicate) out.ableToCommunicate = derived.ableToCommunicate;
  if (!out.preferredLang) out.preferredLang = derived.preferredLang;
  if (!out.serviceIn) out.serviceIn = derived.serviceIn;
  if (!out.nativeLang) out.nativeLang = String(out.citizenship || "English");

  expandPrefixedDate(out, "passportIssue", "passportIssue");
  expandPrefixedDate(out, "passportExpiry", "passportExpiry");
  expandPrefixedDate(out, "natIdIssue", "natIdIssue");
  expandPrefixedDate(out, "natIdExpiry", "natIdExpiry");
  expandPrefixedDate(out, "usCardExpiry", "usCardExpiry");
  expandPrefixedDate(out, "corFrom", "corFrom");
  expandPrefixedDate(out, "corTo", "corTo");
  expandPrefixedDate(out, "studyFrom", "studyFrom");
  expandPrefixedDate(out, "studyTo", "studyTo");
  expandPrefixedDate(out, "workFrom", "workFrom");
  expandPrefixedDate(out, "workTo", "workTo");
  expandPrefixedDate(out, "caqExpiry", "caqExpiry");
  expandPrefixedDate(out, "palExpiry", "palExpiry");
  expandPrefixedDate(out, "marriage", "marriageDate");

  // Work QC CAQ aliases → primary caq* keys when study CAQ empty
  if (!out.caqNumber && out.workCaqNumber) {
    out.caqNumber = out.workCaqNumber;
  }
  if (!out.caqExpiry && out.workCaqExpiry) {
    expandPrefixedDate(out, "caqExpiry", "workCaqExpiry");
  }

  out.hasAlias = yn(out.hasAlias, "N");
  out.hasNatId = yn(out.hasNatId, "N");
  out.hasUsCard = yn(out.hasUsCard, "N");
  out.previousCor = yn(out.previousCor, "N");
  out.sameAsCor = yn(out.sameAsCor, "Y");
  out.sameAsMailing = yn(out.sameAsMailing, "Y");
  out.previouslyMarried = yn(out.previouslyMarried, "N");
  out.educationIndicator = yn(out.educationIndicator, "N");
  out.langTest = yn(out.langTest, "N");
  out.bgTb = yn(out.bgTb, "N");
  out.bgDisorder = yn(out.bgDisorder, "N");
  out.bgOverstay = yn(out.bgOverstay, "N");
  out.bgRefused = yn(out.bgRefused, "N");
  out.bgClaimAsylum = yn(out.bgClaimAsylum, "N");
  out.bgCrime = yn(out.bgCrime ?? out.bgCriminal, "N");
  out.bgMilitary = yn(out.bgMilitary, "N");
  out.bgViolence = yn(out.bgViolence, "N");
  out.bgWitness = yn(out.bgWitness, "N");
  out.cicContactConsent = yn(out.cicContactConsent, "Y");
  out.hasRepresentative = true;

  if (out.sameAsMailing === "N") {
    out.residential = {
      streetNum: String(out.resStreetNum || ""),
      streetName: String(out.resStreetName || ""),
      city: String(out.resCity || ""),
      country: String(out.resCountry || ""),
      provinceState: String(out.resProvinceState || "") || undefined,
      postalCode: String(out.resPostalCode || ""),
      aptUnit: String(out.resAptUnit || "") || undefined,
    };
  }

  if (out.sameAsCor === "N") {
    const from = splitIsoDate(out.cwaFrom);
    const to = splitIsoDate(out.cwaTo);
    out.cwaRow = {
      country: String(out.cwaCountry || ""),
      status: String(out.cwaStatus || ""),
      other: String(out.cwaOther || "") || undefined,
      fromYear: from.year || "",
      fromMonth: from.month || "",
      fromDay: from.day || "",
      toYear: to.year || "",
      toMonth: to.month || "",
      toDay: to.day || "",
    };
  }

  if (out.previouslyMarried === "Y") {
    const dob = splitIsoDate(out.prevSpouseDob);
    const from = splitIsoDate(out.prevSpouseFrom);
    const to = splitIsoDate(out.prevSpouseTo);
    out.prevSpouse = {
      familyName: String(out.prevSpouseFamilyName || ""),
      givenName: String(out.prevSpouseGivenName || ""),
      dobYear: dob.year || "",
      dobMonth: dob.month || "",
      dobDay: dob.day || "",
      relationshipType: String(out.prevSpouseRelationship || "01"),
      fromYear: from.year || "",
      fromMonth: from.month || "",
      fromDay: from.day || "",
      toYear: to.year || "",
      toMonth: to.month || "",
      toDay: to.day || "",
    };
  }

  const previousCorRows = Array.isArray(out.previousCorRows)
    ? (out.previousCorRows as Record<string, unknown>[])
    : [];
  if (out.previousCor === "Y") {
    out.previousCorRows = previousCorRows.map(mapCorRow).slice(0, 2);
  } else {
    out.previousCorRows = [];
  }

  const jobs = Array.isArray(out.jobs)
    ? (out.jobs as Record<string, unknown>[])
    : [];
  out.jobs = jobs.map(mapJobRow).slice(0, 3);
  if (
    Array.isArray(out.jobs) &&
    out.jobs.length > 0 &&
    !(out.occupation || out.employer)
  ) {
    const first = out.jobs[0] as Record<string, unknown>;
    out.occupation = first.occupation;
    out.employer = first.employer;
  }

  const educationRows = Array.isArray(out.educationRows)
    ? (out.educationRows as Record<string, unknown>[])
    : [];
  if (out.educationIndicator === "Y" && educationRows.length > 0) {
    out.educationRow = mapEducationRow(educationRows[0]!);
  }

  // Companion / 5710 flags
  out.spouseAccompanying =
    yn(out.spouseAccompanying, "N") === "Y" || out.spouseAccompanying === true;
  out.lcpChildCare = yn(out.lcpChildCare, "N") === "Y";
  out.lcpDisabled = yn(out.lcpDisabled, "N") === "Y";
  out.lcpElderly = yn(out.lcpElderly, "N") === "Y";
  out.lcpOther = yn(out.lcpOther, "N") === "Y";
  out.applyingExtend = yn(out.applyingExtend, "N") === "Y";
  out.applyingRestore = yn(out.applyingRestore, "N") === "Y";
  out.applyingNewEmployer = yn(out.applyingNewEmployer, "N") === "Y";
  out.applyingTrp = yn(out.applyingTrp, "N") === "Y";

  out.hasDesignee = yn(out.hasDesignee, "N");
  out.isCommonLaw = yn(out.isCommonLaw, "N");
  out.needsCustodian = yn(out.needsCustodian, "N");

  // Defaults that remain only when still empty (never overwrite questionnaire)
  if (!out.phoneType) out.phoneType = "02";
  if (!out.currentStatus) out.currentStatus = "01";
  if (!out.funds) out.funds = "Myself";

  return out;
}
