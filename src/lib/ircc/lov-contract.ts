/**
 * Maps questionnaire select values to IRCC XFA list / field names.
 * Values must remain a subset of the live PDF `lic` (or save) codes.
 */
import { QUESTIONNAIRE_LOVS } from "./fields";

export type LovContract = {
  id: string;
  /** Blank keys in form-meta.json, e.g. imm1294e */
  blanks: string[];
  /** Embedded list tag or XFA field name, tried in order. */
  irccNames: string[];
  values: string[];
};

function valuesOf(
  opts: ReadonlyArray<{ value: string }>,
): string[] {
  return opts.map((opt) => opt.value);
}

/** Identity / contact lists shared by the primary application PDFs. */
const IDENTITY = [
  "imm1294e",
  "imm1294f",
  "imm1295e",
  "imm5257e",
  "imm5257f",
  "imm5708e",
  "imm5708f",
  "imm5709e",
  "imm5709f",
  "imm5710e",
  "imm5710f",
];

const STUDY = ["imm1294e", "imm1294f", "imm5709e", "imm5709f"];

export const LOV_CONTRACT: LovContract[] = [
  {
    id: "sex",
    blanks: IDENTITY,
    irccNames: ["GenderMel", "Sex", "Sexe", "Genre"],
    values: valuesOf(QUESTIONNAIRE_LOVS.sex),
  },
  {
    id: "marital",
    blanks: IDENTITY,
    irccNames: ["MaritalStatus", "EtatCivil"],
    values: valuesOf(QUESTIONNAIRE_LOVS.marital),
  },
  {
    id: "immigrationStatus",
    blanks: IDENTITY,
    irccNames: ["ImmigrationStatus", "StatutImmigration"],
    values: valuesOf(QUESTIONNAIRE_LOVS.status),
  },
  {
    id: "phoneType",
    blanks: IDENTITY,
    irccNames: ["PhoneType", "PhoneTypeTRV"],
    values: valuesOf(QUESTIONNAIRE_LOVS.phone),
  },
  {
    id: "studyLevel",
    blanks: STUDY,
    irccNames: ["LevelOfStudy", "EducationLevel"],
    values: valuesOf(QUESTIONNAIRE_LOVS.studyLevel),
  },
  {
    id: "fieldOfStudy",
    blanks: STUDY,
    irccNames: ["FieldOfStudy"],
    values: valuesOf(QUESTIONNAIRE_LOVS.fieldOfStudy),
  },
  {
    id: "funds",
    blanks: STUDY,
    irccNames: ["ExpensesPaidBySP", "Funds", "Pay", "ExpPaidBy"],
    values: valuesOf(QUESTIONNAIRE_LOVS.funds),
  },
  {
    id: "ableToCommunicate",
    blanks: IDENTITY,
    irccNames: [
      "AbleCommunicateEnglishOrFrench",
      "communicateLang",
      "LangTest",
    ],
    values: valuesOf(QUESTIONNAIRE_LOVS.communicate),
  },
  {
    id: "workPermitType",
    blanks: ["imm1295e", "imm1295f"],
    irccNames: ["WorkPermitType"],
    values: valuesOf(QUESTIONNAIRE_LOVS.workPermit),
  },
  {
    id: "workPermitTypeInland",
    blanks: ["imm5710e", "imm5710f"],
    irccNames: ["WorkPermitTypeInLand", "WorkPermitType"],
    values: valuesOf(QUESTIONNAIRE_LOVS.workPermitInland),
  },
  {
    // Full country list lives on 1294e; skip FR — same codes, twice the decrypt.
    id: "country",
    blanks: ["imm1294e"],
    irccNames: ["Country"],
    values: valuesOf(QUESTIONNAIRE_LOVS.country),
  },
  {
    id: "visitPurpose",
    blanks: ["imm5257e", "imm5257f", "imm5708e", "imm5708f"],
    // VisitPurpose first: on 5708, PurposeOfVisit is the shorter original-entry list.
    irccNames: ["VisitPurpose", "PurposeOfVisit"],
    values: valuesOf(QUESTIONNAIRE_LOVS.visitPurpose),
  },
  {
    id: "visitPurposeOriginal",
    blanks: ["imm5708e", "imm5708f", "imm5709e", "imm5709f", "imm5710e", "imm5710f"],
    irccNames: ["PurposeOfVisit", "VisitPurposeOriginal"],
    values: valuesOf(QUESTIONNAIRE_LOVS.visitPurposeOriginal),
  },
  {
    id: "nativeLang",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["nativeLang", "Languages"],
    values: valuesOf(QUESTIONNAIRE_LOVS.language),
  },
];
