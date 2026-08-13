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

const PRIMARY = [
  "imm1294e",
  "imm1294f",
  "imm1295e",
  "imm5710e",
  "imm5710f",
];

export const LOV_CONTRACT: LovContract[] = [
  {
    id: "sex",
    blanks: PRIMARY,
    irccNames: ["GenderMel", "Sex", "Sexe", "Genre"],
    values: valuesOf(QUESTIONNAIRE_LOVS.sex),
  },
  {
    id: "marital",
    blanks: PRIMARY,
    irccNames: ["MaritalStatus", "EtatCivil"],
    values: valuesOf(QUESTIONNAIRE_LOVS.marital),
  },
  {
    id: "immigrationStatus",
    blanks: PRIMARY,
    irccNames: ["ImmigrationStatus", "StatutImmigration"],
    values: valuesOf(QUESTIONNAIRE_LOVS.status),
  },
  {
    id: "phoneType",
    blanks: PRIMARY,
    irccNames: ["PhoneType", "PhoneTypeTRV"],
    values: valuesOf(QUESTIONNAIRE_LOVS.phone),
  },
  {
    id: "studyLevel",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["LevelOfStudy", "EducationLevel"],
    values: valuesOf(QUESTIONNAIRE_LOVS.studyLevel),
  },
  {
    id: "fieldOfStudy",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["FieldOfStudy"],
    values: valuesOf(QUESTIONNAIRE_LOVS.fieldOfStudy),
  },
  {
    id: "funds",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["ExpensesPaidBySP", "Funds", "Pay"],
    values: valuesOf(QUESTIONNAIRE_LOVS.funds),
  },
  {
    id: "ableToCommunicate",
    blanks: PRIMARY,
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
    id: "country",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["Country"],
    values: valuesOf(QUESTIONNAIRE_LOVS.country),
  },
  {
    id: "nativeLang",
    blanks: ["imm1294e", "imm1294f"],
    irccNames: ["nativeLang", "Languages"],
    values: valuesOf(QUESTIONNAIRE_LOVS.language),
  },
];
