/**
 * Questionnaire-keyed fill cases for weekly certify/coverage.
 * Values use CANONICAL_FIELDS / REPEATABLE_TABLES keys only.
 */
import { showWhenClauses } from "@/lib/forms/visibility";
import {
  CANONICAL_FIELDS,
  CHECKLIST_FORM_CODES,
  REPEATABLE_TABLES,
  fieldsForFormCodes,
  isFieldVisible,
  isTableVisible,
  tablesForFormCodes,
  type CanonicalField,
  type FieldType,
  type RepeatableTable,
  type TableColumn,
} from "./fields";

export const FILL_CASE_IDS = ["required", "typical", "full"] as const;
export type FillCaseId = (typeof FILL_CASE_IDS)[number];

/** Not asked in the questionnaire; fillers still need a language and person email. */
const SYSTEM_KEYS = new Set(["formLanguage", "email"]);

const FIELD_KEYS = new Set(CANONICAL_FIELDS.map((field) => field.key));
const TABLE_KEYS = new Set(REPEATABLE_TABLES.map((table) => table.key));

export function isQuestionnaireAnswerKey(key: string): boolean {
  return FIELD_KEYS.has(key) || TABLE_KEYS.has(key) || SYSTEM_KEYS.has(key);
}

/** Distinctive values that satisfy Acrobat pictures (LMIA range, dates after today). */
const BY_KEY: Record<string, string> = {
  familyName: "Benali",
  givenName: "Amine",
  sex: "Male",
  dob: "1998-03-15",
  placeBirthCity: "Casablanca",
  placeBirthCountry: "022",
  citizenship: "022",
  citizenship2: "511",
  nativeLang: "001",
  ableToCommunicate: "Both",
  preferredLang: "English",
  phoneCountryCode: "212",
  phone: "661234567",
  phoneType: "02",
  streetNum: "12",
  streetName: "Rue Atlas",
  aptUnit: "4B",
  city: "Casablanca",
  provinceState: "Casablanca-Settat",
  country: "022",
  postalCode: "20000",
  currentCountry: "022",
  corFrom: "2024-01-15",
  corTo: "2027-12-31",
  corOther: "Temporary resident",
  cwaCountry: "022",
  cwaStatus: "04",
  cwaOther: "Work permit",
  cwaFrom: "2024-01-15",
  cwaTo: "2027-12-31",
  passportNumber: "AB1234567",
  passportCountry: "022",
  passportIssue: "2022-01-10",
  passportExpiry: "2032-01-10",
  natIdNumber: "MA998877",
  natIdCountry: "022",
  natIdIssue: "2020-03-01",
  natIdExpiry: "2030-03-01",
  usCardNumber: "USC123456",
  usCardExpiry: "2029-06-01",
  uci: "12345678",
  heightCm: "175",
  eyeColor: "03",
  aliasFamilyName: "Alami",
  aliasGivenName: "Karim",
  spouseFamilyName: "Benali",
  spouseGivenName: "Sara",
  spouseDob: "1999-08-20",
  spouseCob: "022",
  spouseOccupation: "Teacher",
  marriageDate: "2022-06-01",
  prevSpouseFamilyName: "Haddad",
  prevSpouseGivenName: "Youssef",
  prevSpouseDob: "1990-04-12",
  prevSpouseRelationship: "01",
  prevSpouseFrom: "2012-06-01",
  prevSpouseTo: "2018-03-15",
  schoolName: "University of Waterloo",
  schoolAddress: "200 University Ave W",
  schoolCity: "Waterloo",
  schoolProvince: "ON",
  dli: "O19377235822",
  studentId: "20998877",
  studyLevel: "10",
  fieldOfStudy: "04",
  studyFrom: "2026-09-01",
  studyTo: "2028-04-30",
  tuitionAmount: "28000",
  roomBoard: "12000",
  otherStudyCosts: "2000",
  availableFunds: "45000",
  funds: "Parents",
  palNumber: "PAL-ON-9988",
  palExpiry: "2027-12-31",
  studyWorkPermitType: "OWP",
  visaType: "Visitor",
  visitPurpose: "02",
  visitPurposeOther: "Conference",
  visitFrom: "2026-09-15",
  visitTo: "2026-12-15",
  visitHostName: "Nadia Tremblay",
  visitHostRelationship: "Aunt",
  visitHostAddress: "88 King St W, Toronto ON",
  visitHost2Name: "Omar Haddad",
  visitHost2Relationship: "Friend",
  visitHost2Address: "15 Queen St, Ottawa ON",
  visitFundsAmount: "8000",
  visitFunds: "Myself",
  visitorOrigEntryDate: "2025-09-01",
  visitorOrigEntryPlace: "Toronto Pearson",
  visitorRecentEntryDate: "2026-01-10",
  visitorRecentEntryPlace: "Montreal",
  visitorPrevDocNum: "V123456",
  employerName: "Maple Tech Inc",
  employerAddress: "100 King St W, Toronto",
  jobTitle: "Software developer",
  jobDescription: "Build internal tools",
  workPermitType: "LMOS",
  workPurposeType: "LMOS",
  lmiaNumber: "8000000",
  workProvince: "ON",
  workCity: "Toronto",
  workLocationAddress: "100 King St W, Toronto",
  workFrom: "2026-09-01",
  workTo: "2028-09-01",
  workCaqNumber: "CAQ-1234567",
  workCaqExpiry: "2028-08-31",
  origEntryDate: "2025-09-01",
  origEntryPlace: "Toronto Pearson",
  purposeOfVisit: "04",
  recentEntryDate: "2026-01-10",
  recentEntryPlace: "Montreal",
  prevDocNum: "W987654",
  parent1FamilyName: "Benali",
  parent1GivenName: "Hassan",
  parent1Dob: "1968-02-02",
  parent1Cob: "022",
  parent1Occupation: "Engineer",
  parent1Address: "12 Rue Atlas, Casablanca",
  parent1Telephone: "661111111",
  parent2FamilyName: "Benali",
  parent2GivenName: "Amina",
  parent2Dob: "1970-05-05",
  parent2Cob: "022",
  parent2Occupation: "Nurse",
  parent2Address: "12 Rue Atlas, Casablanca",
  parent2Telephone: "662222222",
  custodianFamilyName: "Tremblay",
  custodianGivenName: "Nadia",
  custodianDob: "1975-01-01",
  custodianStatus: "Citizen",
  custodianAddress: "88 King St W, Toronto ON",
  custodianTelephone: "4165551212",
  designeeFamilyName: "Haddad",
  designeeGivenName: "Omar",
  designeeRelationship: "Brother",
  bgTbDetails: "Treated in 2019, cleared",
  bgRefusedDetails: "Visitor visa refused 2021",
  bgCrimeDetails: "No conviction, charge withdrawn",
  bgMilitaryDetails: "National service 2017",
  citizenshipLanguage: "English",
  accommodationType: "Large print",
  applyingProgram: "02",
  applyingCategory: "09",
  lcpNoPersons: "2",
  workPurposeOther: "Intra-company",
  provNominee: "OINP-8899",
};

const FULL_GATES: Record<string, string> = {
  maritalStatus: "01",
  currentStatus: "06",
  hasAlias: "Y",
  sameAsMailing: "N",
  sameAsCor: "N",
  previousCor: "Y",
  hasNatId: "Y",
  hasUsCard: "Y",
  langTest: "Y",
  previouslyMarried: "Y",
  educationIndicator: "Y",
  hasChildren: "Y",
  hasSiblings: "Y",
  needsCustodian: "Y",
  hasDesignee: "Y",
  studyNeedsWorkPermit: "Y",
  workPermitType: "LMOS",
  workPurposeType: "LMOS",
  workProvince: "QC",
  palNumber: "PAL-ON-9988",
  spouseAccompanying: "Y",
  applyingExtend: "Y",
  visitorApplyExtend: "Y",
  applyingRestore: "N",
  applyingNewEmployer: "Y",
  applyingTrp: "N",
  bgTb: "Y",
  bgDisorder: "N",
  bgOverstay: "N",
  bgRefused: "Y",
  bgClaimAsylum: "N",
  bgCrime: "N",
  bgMilitary: "Y",
  bgViolence: "Y",
  bgWitness: "N",
  traveledOtherCountry: "Y",
  hasMembership: "Y",
  heldGovPosition: "Y",
  cicContactConsent: "Y",
  lcpChildCare: "Y",
  needsAccommodation: "Y",
};

const TYPICAL_GATES: Record<string, string> = {
  maritalStatus: "01",
  currentStatus: "04",
  hasAlias: "N",
  sameAsMailing: "Y",
  sameAsCor: "Y",
  previousCor: "N",
  educationIndicator: "N",
  workPermitType: "LMOS",
  workPurposeType: "LMOS",
  workProvince: "ON",
  spouseAccompanying: "Y",
  cicContactConsent: "Y",
};

const REQUIRED_GATES: Record<string, string> = {
  maritalStatus: "02",
  currentStatus: "01",
  hasAlias: "N",
  sameAsMailing: "Y",
  sameAsCor: "Y",
  previousCor: "N",
  educationIndicator: "N",
  cicContactConsent: "Y",
};

function sampleForType(
  key: string,
  type: FieldType,
  options: { value: string }[] | undefined,
  rowIndex: number,
): string {
  if (BY_KEY[key]) {
    if (key === "familyName" && rowIndex > 0) return `Benali${rowIndex + 1}`;
    if (key === "givenName" && rowIndex > 0) return rowIndex === 1 ? "Youssef" : "Leila";
    return BY_KEY[key];
  }
  if (options?.length) return options[0]!.value;
  switch (type) {
    case "date":
      if (/dob|Dob$/i.test(key)) return rowIndex === 0 ? "2023-04-01" : "2001-11-11";
      if (/expir|Expiry|To$/i.test(key) || /To$/.test(key)) return "2027-12-31";
      if (/issue|Issue|From$/i.test(key) || /From$/.test(key)) return "2024-01-15";
      return "2026-09-01";
    case "month":
      if (/to$/i.test(key)) return "2026-06";
      return "2022-09";
    case "yesno":
    case "checkbox":
      return "N";
    case "email":
      return "amine.benali@example.com";
    case "tel":
      return "661234567";
    case "textarea":
      return "Details provided in questionnaire";
    default:
      return key.replace(/([A-Z])/g, " $1").trim().slice(0, 24) || "Sample";
  }
}

function sampleField(field: CanonicalField, rowIndex = 0): string {
  return sampleForType(field.key, field.type, field.options, rowIndex);
}

function sampleColumn(col: TableColumn, rowIndex: number): string {
  if (col.required === false && !col.options && col.type === "text" && col.key === "other") {
    return rowIndex === 0 ? "Other status" : "";
  }
  return sampleForType(col.key, col.type, col.options, rowIndex);
}

function sampleRow(table: RepeatableTable, rowIndex: number): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of table.columns) {
    row[col.key] = sampleColumn(col, rowIndex);
  }
  if (table.key === "siblings" && !row.relationship) {
    row.relationship = rowIndex === 0 ? "sister" : "brother";
  }
  if (table.key === "children" && !row.relationship) {
    row.relationship = rowIndex === 0 ? "son" : "daughter";
  }
  if (table.key === "previousCorRows") {
    row.from = "2018-01-10";
    row.to = "2023-12-01";
  }
  return row;
}

function keysForForm(formCode: string): Set<string> {
  const keys = new Set<string>(["formLanguage", "email"]);
  for (const field of fieldsForFormCodes([formCode])) {
    keys.add(field.key);
    for (const clause of showWhenClauses(field.showWhen)) keys.add(clause.key);
  }
  for (const table of tablesForFormCodes([formCode])) {
    keys.add(table.key);
    for (const clause of showWhenClauses(table.showWhen)) keys.add(clause.key);
  }
  return keys;
}

function applyFormOverrides(
  formCode: string,
  density: FillCaseId,
  answers: Record<string, unknown>,
) {
  if (formCode === "imm5409") {
    answers.maritalStatus = "03";
  }
  if (density === "full" && formCode === "imm5257") {
    answers.visitPurpose = "03";
  }
}

function fillVisible(
  formCode: string,
  density: FillCaseId,
  answers: Record<string, unknown>,
) {
  const fields = fieldsForFormCodes([formCode]);
  const tables = tablesForFormCodes([formCode]);

  for (let pass = 0; pass < 6; pass++) {
    for (const field of fields) {
      if (field.hidden) continue;
      if (!isFieldVisible(field, answers)) continue;
      if (answers[field.key] !== undefined && answers[field.key] !== "") continue;
      if (density === "required" && !field.required) continue;
      answers[field.key] = sampleField(field);
    }
    for (const table of tables) {
      if (!isTableVisible(table, answers)) continue;
      if (Array.isArray(answers[table.key]) && (answers[table.key] as unknown[]).length) {
        continue;
      }
      const minRows = table.minRows ?? 0;
      let count = 0;
      if (density === "required") {
        count = minRows;
        if (count === 0) continue;
      } else if (density === "typical") {
        count = Math.max(minRows, 1);
      } else {
        count = Math.min(Math.max(minRows, 2), table.maxRows);
      }
      answers[table.key] = Array.from({ length: count }, (_, i) => sampleRow(table, i));
    }
  }
}

export function answersForForm(
  formCode: string,
  density: FillCaseId,
  lang: "e" | "f" = "e",
): Record<string, unknown> {
  const allowed = keysForForm(formCode);
  const answers: Record<string, unknown> = {
    formLanguage: lang,
    email: "amine.benali@example.com",
  };
  const gates =
    density === "full"
      ? FULL_GATES
      : density === "typical"
        ? TYPICAL_GATES
        : REQUIRED_GATES;
  for (const [key, value] of Object.entries(gates)) {
    if (allowed.has(key)) answers[key] = value;
  }
  applyFormOverrides(formCode, density, answers);
  fillVisible(formCode, density, answers);
  for (const key of Object.keys(answers)) {
    if (!allowed.has(key)) delete answers[key];
  }

  for (const key of Object.keys(answers)) {
    if (!isQuestionnaireAnswerKey(key)) {
      throw new Error(`Fixture ${formCode}/${density} used non-questionnaire key ${key}`);
    }
  }
  return answers;
}

export function fillCasesForForm(formCode: string): FillCaseId[] {
  if (CHECKLIST_FORM_CODES.has(formCode)) {
    return ["required", "full"];
  }
  const required = JSON.stringify(answersForForm(formCode, "required"));
  const typical = JSON.stringify(answersForForm(formCode, "typical"));
  if (required === typical) return ["required", "full"];
  return [...FILL_CASE_IDS];
}
