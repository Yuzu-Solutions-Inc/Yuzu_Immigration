/**
 * Soft data-quality flags for questionnaire answers.
 * These never block save or PDF download — they highlight likely entry errors.
 */

import {
  CHECKLIST_FORM_CODES,
  fieldsForFormCodes,
  sectionsForFields,
  tablesForFormCodes,
  type QuestionnaireSection,
} from "@/lib/ircc/fields";

export type QualityIssue = {
  id: QualityIssueId;
  section: QuestionnaireSection;
  params?: Record<string, string | number>;
};

export type QualityIssueId =
  | "passportExpired"
  | "passportExpiringSoon"
  | "passportIssueAfterExpiry"
  | "passportIssueInFuture"
  | "passportIssueBeforeDob"
  | "natIdExpired"
  | "usCardExpired"
  | "caqExpired"
  | "palExpired"
  | "workCaqExpired"
  | "rangeInverted"
  | "rangeInvertedRow"
  | "timelineGap"
  | "timelineOverlap"
  | "multipleCurrentJobs"
  | "dobInFuture"
  | "ageUnrealistic"
  | "parentYoungerThanApplicant"
  | "childOlderThanParent"
  | "spouseAgeUnrealistic"
  | "marriageBeforeAdult"
  | "dliFormat"
  | "quebecCaqMissing"
  | "postalCodeCanada"
  | "postalCodeUs"
  | "moneyNotNumeric"
  | "commonLawUnderOneYear"
  | "studyMinorNoCustodian";

const CANADA = "511";
const UNITED_STATES = "461";
const PASSPORT_VALIDITY_MONTHS = 6;
const GAP_MONTHS = 1;
const MINOR_AGE = 17;
const ADULT_AGE = 16;
const MAX_AGE = 110;
const STUDY_FORMS = new Set(["imm1294", "imm5709"]);

function filled(value: unknown): boolean {
  return String(value ?? "").trim() !== "";
}

function parseIso(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const date = Number(day[3]);
    if (month < 1 || month > 12 || date < 1 || date > 31) return null;
    const utc = new Date(Date.UTC(year, month - 1, date));
    if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1) {
      return null;
    }
    return utc;
  }
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(s);
  if (monthOnly) {
    const year = Number(monthOnly[1]);
    const month = Number(monthOnly[2]);
    if (month < 1 || month > 12) return null;
    return new Date(Date.UTC(year, month - 1, 1));
  }
  return null;
}

function endOfPeriod(date: Date, precision: "day" | "month"): Date {
  if (precision === "day") return date;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function monthsBetween(later: Date, earlier: Date): number {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth()) -
    (later.getUTCDate() < earlier.getUTCDate() ? 1 : 0)
  );
}

function ageYears(dob: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

function rowsOf(answers: Record<string, unknown>, key: string) {
  const value = answers[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

function rowHasDates(row: Record<string, unknown>) {
  return filled(row.from) || filled(row.to);
}

function yn(value: unknown): boolean {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "Y" || v === "YES" || v === "TRUE" || v === "1";
}

function isNumericMoney(value: unknown): boolean {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^(CAD|USD|CDN)\s*/i, "")
    .replace(/[$\s,]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(cleaned);
}

function canadianPostal(value: string): boolean {
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(
    value.trim(),
  );
}

function usZip(value: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(value.trim());
}

function dliLooksValid(value: string): boolean {
  return /^O\d{8,12}$/i.test(value.trim());
}

function push(
  issues: QualityIssue[],
  id: QualityIssueId,
  section: QuestionnaireSection,
  params?: Record<string, string | number>,
) {
  issues.push(params ? { id, section, params } : { id, section });
}

function flagExpired(
  issues: QualityIssue[],
  raw: unknown,
  asOf: Date,
  expiredId: QualityIssueId,
  soonId: QualityIssueId | null,
  section: QuestionnaireSection,
) {
  const date = parseIso(raw);
  if (!date) return;
  const today = startOfDay(asOf);
  if (date < today) {
    push(issues, expiredId, section);
    return;
  }
  if (!soonId) return;
  const months = monthsBetween(date, today);
  if (months >= 0 && months < PASSPORT_VALIDITY_MONTHS) {
    push(issues, soonId, section, {
      months: Math.max(1, months || 1),
    });
  }
}

function flagRange(
  issues: QualityIssue[],
  fromRaw: unknown,
  toRaw: unknown,
  section: QuestionnaireSection,
  item: string,
) {
  const from = parseIso(fromRaw);
  const to = parseIso(toRaw);
  if (!from || !to) return;
  if (to < from) {
    push(issues, "rangeInverted", section, { item });
  }
}

type TimelineRow = {
  index: number;
  from: Date;
  to: Date | null;
};

function timelineRows(
  rows: Array<Record<string, unknown>>,
  precision: "day" | "month",
): TimelineRow[] {
  const out: TimelineRow[] = [];
  rows.forEach((row, index) => {
    if (!rowHasDates(row)) return;
    const from = parseIso(row.from);
    if (!from) return;
    const toRaw = parseIso(row.to);
    out.push({
      index: index + 1,
      from,
      to: toRaw ? endOfPeriod(toRaw, precision) : null,
    });
  });
  return out;
}

function flagTimeline(
  issues: QualityIssue[],
  rows: Array<Record<string, unknown>>,
  section: QuestionnaireSection,
  table: string,
  precision: "day" | "month",
  options?: { gaps?: boolean; overlaps?: boolean; inverted?: boolean },
) {
  const gaps = options?.gaps ?? true;
  const overlaps = options?.overlaps ?? false;
  const inverted = options?.inverted ?? true;

  rows.forEach((row, index) => {
    if (!inverted || !rowHasDates(row)) return;
    const from = parseIso(row.from);
    const to = parseIso(row.to);
    if (from && to && to < from) {
      push(issues, "rangeInvertedRow", section, {
        table,
        row: index + 1,
      });
    }
  });

  const items = timelineRows(rows, precision).sort(
    (a, b) => a.from.getTime() - b.from.getTime(),
  );
  if (items.length < 2 && !overlaps) return;

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1]!;
    const next = items[i]!;
    const prevEnd = prev.to;
    if (!prevEnd) continue;
    if (overlaps && next.from <= prevEnd) {
      push(issues, "timelineOverlap", section, {
        table,
        rowA: prev.index,
        rowB: next.index,
      });
      continue;
    }
    if (gaps && next.from > prevEnd) {
      const gap = monthsBetween(next.from, prevEnd);
      if (gap > GAP_MONTHS) {
        push(issues, "timelineGap", section, {
          table,
          months: gap,
          row: prev.index,
        });
      }
    }
  }
}

export function analyzeAnswerQuality(
  answers: Record<string, unknown>,
  options?: { formCodes?: string[]; asOf?: Date },
): QualityIssue[] {
  const asOf = options?.asOf ?? new Date();
  const today = startOfDay(asOf);
  const formCodes = (options?.formCodes ?? []).map((code) =>
    code.toLowerCase(),
  );
  const issues: QualityIssue[] = [];

  const dob = parseIso(answers.dob);
  if (dob) {
    if (dob > today) push(issues, "dobInFuture", "identity");
    const age = ageYears(dob, today);
    if (age > MAX_AGE || age < 0) push(issues, "ageUnrealistic", "identity");
    if (
      age >= 0 &&
      age < MINOR_AGE &&
      formCodes.some((code) => STUDY_FORMS.has(code)) &&
      !yn(answers.needsCustodian)
    ) {
      push(issues, "studyMinorNoCustodian", "identity");
    }
  }

  flagExpired(
    issues,
    answers.passportExpiry,
    asOf,
    "passportExpired",
    "passportExpiringSoon",
    "passport",
  );
  const issueDate = parseIso(answers.passportIssue);
  const expiryDate = parseIso(answers.passportExpiry);
  if (issueDate && expiryDate && issueDate > expiryDate) {
    push(issues, "passportIssueAfterExpiry", "passport");
  }
  if (issueDate && issueDate > today) {
    push(issues, "passportIssueInFuture", "passport");
  }
  if (issueDate && dob && issueDate < dob) {
    push(issues, "passportIssueBeforeDob", "passport");
  }
  if (yn(answers.hasNatId)) {
    flagExpired(issues, answers.natIdExpiry, asOf, "natIdExpired", null, "passport");
  }
  if (yn(answers.hasUsCard)) {
    flagExpired(issues, answers.usCardExpiry, asOf, "usCardExpired", null, "passport");
  }

  flagRange(
    issues,
    answers.studyFrom,
    answers.studyTo,
    "study",
    "study",
  );
  flagRange(
    issues,
    answers.visitFrom,
    answers.visitTo,
    "visit",
    "visit",
  );
  flagRange(
    issues,
    answers.workFrom,
    answers.workTo,
    "work",
    "work",
  );
  flagRange(issues, answers.corFrom, answers.corTo, "residence", "cor");
  flagRange(issues, answers.cwaFrom, answers.cwaTo, "residence", "cwa");
  flagRange(
    issues,
    answers.prevSpouseFrom,
    answers.prevSpouseTo,
    "family",
    "prevSpouse",
  );

  flagExpired(issues, answers.caqExpiry, asOf, "caqExpired", null, "study");
  flagExpired(issues, answers.palExpiry, asOf, "palExpired", null, "study");
  flagExpired(
    issues,
    answers.workCaqExpiry,
    asOf,
    "workCaqExpired",
    null,
    "work",
  );

  if (String(answers.schoolProvince ?? "") === "QC" && !filled(answers.caqNumber)) {
    push(issues, "quebecCaqMissing", "study");
  }
  if (filled(answers.dli) && !dliLooksValid(String(answers.dli))) {
    push(issues, "dliFormat", "study");
  }
  if (filled(answers.tuitionAmount) && !isNumericMoney(answers.tuitionAmount)) {
    push(issues, "moneyNotNumeric", "study", { field: "tuitionAmount" });
  }
  if (
    filled(answers.availableFunds) &&
    !isNumericMoney(answers.availableFunds)
  ) {
    push(issues, "moneyNotNumeric", "study", { field: "availableFunds" });
  }

  const mailingCountry = String(answers.country ?? "");
  if (filled(answers.postalCode) && mailingCountry === CANADA) {
    if (!canadianPostal(String(answers.postalCode))) {
      push(issues, "postalCodeCanada", "contact");
    }
  }
  if (filled(answers.postalCode) && mailingCountry === UNITED_STATES) {
    if (!usZip(String(answers.postalCode))) {
      push(issues, "postalCodeUs", "contact");
    }
  }

  const jobs = rowsOf(answers, "jobs");
  flagTimeline(issues, jobs, "employment", "jobs", "month", {
    gaps: true,
    overlaps: false,
  });
  const currentJobs = jobs.filter(
    (row) => filled(row.from) && filled(row.occupation) && !filled(row.to),
  );
  if (currentJobs.length > 1) {
    push(issues, "multipleCurrentJobs", "employment");
  }

  flagTimeline(
    issues,
    rowsOf(answers, "educationRows"),
    "education",
    "educationRows",
    "month",
    { gaps: true, overlaps: false },
  );

  const previousCor = rowsOf(answers, "previousCorRows");
  flagTimeline(issues, previousCor, "residence", "previousCorRows", "day", {
    gaps: true,
    overlaps: true,
  });
  if (yn(answers.previousCor) && previousCor.length > 0 && filled(answers.corFrom)) {
    const latest = timelineRows(previousCor, "day")
      .filter((row) => row.to)
      .sort((a, b) => (b.to?.getTime() ?? 0) - (a.to?.getTime() ?? 0))[0];
    const corFrom = parseIso(answers.corFrom);
    if (latest?.to && corFrom && corFrom > latest.to) {
      const gap = monthsBetween(corFrom, latest.to);
      if (gap > GAP_MONTHS) {
        push(issues, "timelineGap", "residence", {
          table: "previousCorRows",
          months: gap,
          row: latest.index,
        });
      }
    }
  }

  flagTimeline(
    issues,
    rowsOf(answers, "militaryServiceRows"),
    "background",
    "militaryServiceRows",
    "month",
    { gaps: false, overlaps: true },
  );
  flagTimeline(
    issues,
    rowsOf(answers, "previousTravelRows"),
    "background",
    "previousTravelRows",
    "month",
    { gaps: false, overlaps: false },
  );
  flagTimeline(
    issues,
    rowsOf(answers, "membershipRows"),
    "background",
    "membershipRows",
    "month",
    { gaps: false, overlaps: false },
  );
  flagTimeline(
    issues,
    rowsOf(answers, "governmentPositionRows"),
    "background",
    "governmentPositionRows",
    "month",
    { gaps: false, overlaps: false },
  );

  if (dob) {
    const parent1 = parseIso(answers.parent1Dob);
    if (parent1 && parent1 >= dob) {
      push(issues, "parentYoungerThanApplicant", "family", { parent: 1 });
    }
    const parent2 = parseIso(answers.parent2Dob);
    if (parent2 && parent2 >= dob) {
      push(issues, "parentYoungerThanApplicant", "family", { parent: 2 });
    }
    rowsOf(answers, "children").forEach((row, index) => {
      const childDob = parseIso(row.dob);
      if (childDob && childDob <= dob) {
        push(issues, "childOlderThanParent", "family", { row: index + 1 });
      }
    });
  }

  const marital = String(answers.maritalStatus ?? "");
  const spouseDob = parseIso(answers.spouseDob);
  if ((marital === "01" || marital === "03") && spouseDob) {
    const spouseAge = ageYears(spouseDob, today);
    if (spouseAge < ADULT_AGE || spouseAge > MAX_AGE) {
      push(issues, "spouseAgeUnrealistic", "family");
    }
  }
  if (marital === "01") {
    const married = parseIso(answers.marriageDate);
    if (married && dob && ageYears(dob, married) < ADULT_AGE) {
      push(issues, "marriageBeforeAdult", "family");
    }
  }
  if (marital === "03") {
    const years = Number(String(answers.yearsTogether ?? "").replace(",", "."));
    const start = parseIso(answers.commonLawStart);
    const durationMonths = start ? monthsBetween(today, start) : null;
    if (
      (Number.isFinite(years) && years > 0 && years < 1) ||
      (durationMonths != null && durationMonths >= 0 && durationMonths < 12)
    ) {
      push(issues, "commonLawUnderOneYear", "family");
    }
  }

  return issues;
}

export function qualityIssuesForSection(
  issues: QualityIssue[],
  section: QuestionnaireSection,
): QualityIssue[] {
  return issues.filter((issue) => issue.section === section);
}

/** Issues whose section appears on this IRCC form's questionnaire fields. */
export function qualityIssuesForFormCode(
  issues: QualityIssue[],
  formCode: string,
): QualityIssue[] {
  if (CHECKLIST_FORM_CODES.has(formCode.toLowerCase())) return [];
  const sections = new Set(
    sectionsForFields(
      fieldsForFormCodes([formCode]),
      tablesForFormCodes([formCode]),
    ),
  );
  if (sections.size === 0) return [];
  return issues.filter((issue) => sections.has(issue.section));
}
