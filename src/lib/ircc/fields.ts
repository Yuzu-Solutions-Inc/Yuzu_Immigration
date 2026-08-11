/**
 * Ask-once field registry for IRCC forms (excludes document checklists).
 * Labels: messages → forms.fields.* / forms.tables.* / forms.options.*
 */

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "month"
  | "select"
  | "yesno"
  | "textarea"
  | "checkbox";

export type ShowWhen = {
  key: string;
  equals?: string;
  oneOf?: string[];
  notEquals?: string;
};

export type ShowWhenRule = ShowWhen | ShowWhen[] | { or: ShowWhen[] };

export type CanonicalField = {
  key: string;
  section: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  options?: Array<{ value: string; labelKey: string }>;
  showWhen?: ShowWhenRule;
  forms?: string[];
  helpKey?: string;
  /** Wider layout */
  wide?: boolean;
};

export type TableColumn = {
  key: string;
  type: FieldType;
  labelKey: string;
  maxLength?: number;
  options?: Array<{ value: string; labelKey: string }>;
  required?: boolean;
};

export type RepeatableTable = {
  key: string;
  section: string;
  forms?: string[];
  showWhen?: ShowWhenRule;
  maxRows: number;
  minRows?: number;
  columns: TableColumn[];
  helpKey?: string;
};

export const QUESTIONNAIRE_SECTIONS = [
  "identity",
  "contact",
  "residence",
  "passport",
  "family",
  "study",
  "work",
  "employment",
  "education",
  "background",
  "situation",
] as const;

export type QuestionnaireSection = (typeof QUESTIONNAIRE_SECTIONS)[number];

/** Document checklists — never drive questionnaire fields. */
export const CHECKLIST_FORM_CODES = new Set([
  "imm5483",
  "imm5488",
  "imm5556",
]);

const PRIMARY = ["imm1294", "imm1295", "imm5710"] as const;
const STUDY = ["imm1294"] as const;
const WORK = ["imm1295", "imm5710"] as const;
const WORK_IN = ["imm5710"] as const;
const WORK_OUT = ["imm1295"] as const;
const FAMILY_FORM = ["imm5707"] as const;
const CUSTODIAN = ["imm5646"] as const;
const DESIGNEE = ["imm5475"] as const;
const COMMON_LAW = ["imm5409"] as const;

const SEX_OPTS = [
  { value: "Female", labelKey: "sexFemale" },
  { value: "Male", labelKey: "sexMale" },
  { value: "Unknown", labelKey: "sexUnknown" },
];

const MARITAL_OPTS = [
  { value: "02", labelKey: "maritalSingle" },
  { value: "01", labelKey: "maritalMarried" },
  { value: "03", labelKey: "maritalCommonLaw" },
  { value: "04", labelKey: "maritalDivorced" },
  { value: "05", labelKey: "maritalSeparated" },
  { value: "06", labelKey: "maritalWidowed" },
];

const STATUS_OPTS = [
  { value: "01", labelKey: "statusCitizen" },
  { value: "02", labelKey: "statusPR" },
  { value: "03", labelKey: "statusVisitor" },
  { value: "04", labelKey: "statusStudent" },
  { value: "05", labelKey: "statusWorker" },
  { value: "06", labelKey: "statusOther" },
];

const PHONE_TYPE_OPTS = [
  { value: "02", labelKey: "phoneCellular" },
  { value: "01", labelKey: "phoneLandline" },
  { value: "03", labelKey: "phoneBusiness" },
];

const PROVINCE_OPTS = [
  { value: "AB", labelKey: "provAB" },
  { value: "BC", labelKey: "provBC" },
  { value: "MB", labelKey: "provMB" },
  { value: "NB", labelKey: "provNB" },
  { value: "NL", labelKey: "provNL" },
  { value: "NS", labelKey: "provNS" },
  { value: "NT", labelKey: "provNT" },
  { value: "NU", labelKey: "provNU" },
  { value: "ON", labelKey: "provON" },
  { value: "PE", labelKey: "provPE" },
  { value: "QC", labelKey: "provQC" },
  { value: "SK", labelKey: "provSK" },
  { value: "YT", labelKey: "provYT" },
];

const STUDY_LEVEL_OPTS = [
  { value: "01", labelKey: "studyPrimary" },
  { value: "02", labelKey: "studySecondary" },
  { value: "03", labelKey: "studyCollege" },
  { value: "04", labelKey: "studyBachelor" },
  { value: "05", labelKey: "studyMaster" },
  { value: "06", labelKey: "studyDoctorate" },
  { value: "07", labelKey: "studyOtherPost" },
  { value: "08", labelKey: "studyLanguage" },
  { value: "09", labelKey: "studyOther" },
];

const FIELD_OF_STUDY_OPTS = [
  { value: "01", labelKey: "fosArts" },
  { value: "02", labelKey: "fosBusiness" },
  { value: "03", labelKey: "fosScience" },
  { value: "04", labelKey: "fosEngineering" },
  { value: "05", labelKey: "fosHealth" },
  { value: "06", labelKey: "fosEducation" },
  { value: "07", labelKey: "fosLaw" },
  { value: "08", labelKey: "fosTrades" },
  { value: "09", labelKey: "fosOther" },
];

const FUNDS_OPTS = [
  { value: "Myself", labelKey: "fundsMyself" },
  { value: "Parents", labelKey: "fundsParents" },
  { value: "Other", labelKey: "fundsOther" },
];

const LANG_OPTS = [
  { value: "English", labelKey: "langEnglish" },
  { value: "French", labelKey: "langFrench" },
  { value: "Both", labelKey: "langBoth" },
  { value: "Neither", labelKey: "langNeither" },
];

const PREF_LANG_OPTS = [
  { value: "English", labelKey: "langEnglish" },
  { value: "French", labelKey: "langFrench" },
];

const WORK_PERMIT_OPTS = [
  { value: "LMOS", labelKey: "wpLmos" },
  { value: "ELMO", labelKey: "wpElmo" },
  { value: "OWP", labelKey: "wpOwp" },
  { value: "SAWP", labelKey: "wpSawp" },
  { value: "SBC", labelKey: "wpSbc" },
  { value: "Other", labelKey: "wpOther" },
];

const marriedOrCl: ShowWhen = {
  key: "maritalStatus",
  oneOf: ["01", "03"],
};
const tempStatus: ShowWhen = {
  key: "currentStatus",
  oneOf: ["03", "04", "05", "06"],
};

/** Scalar questionnaire fields — email / formLanguage / rep* are not asked. */
export const CANONICAL_FIELDS: CanonicalField[] = [
  // —— Identity ——
  { key: "familyName", section: "identity", type: "text", required: true, maxLength: 80 },
  { key: "givenName", section: "identity", type: "text", required: true, maxLength: 80 },
  { key: "sex", section: "identity", type: "select", required: true, options: SEX_OPTS },
  { key: "dob", section: "identity", type: "date", required: true, helpKey: "dobHelp" },
  {
    key: "placeBirthCity",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
  },
  {
    key: "placeBirthCountry",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
    helpKey: "countryHelp",
  },
  {
    key: "citizenship",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
  },
  {
    key: "maritalStatus",
    section: "identity",
    type: "select",
    required: true,
    options: MARITAL_OPTS,
  },
  {
    key: "hasAlias",
    section: "identity",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "aliasHelp",
  },
  {
    key: "aliasFamilyName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "hasAlias", equals: "Y" },
  },
  {
    key: "aliasGivenName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "hasAlias", equals: "Y" },
  },
  {
    key: "nativeLang",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...PRIMARY],
    helpKey: "nativeLangHelp",
  },
  {
    key: "ableToCommunicate",
    section: "identity",
    type: "select",
    required: true,
    options: LANG_OPTS,
    forms: [...PRIMARY],
  },
  {
    key: "preferredLang",
    section: "identity",
    type: "select",
    options: PREF_LANG_OPTS,
    forms: [...PRIMARY],
  },
  {
    key: "langTest",
    section: "identity",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "langTestHelp",
  },

  // —— Contact / mailing ——
  {
    key: "phoneCountryCode",
    section: "contact",
    type: "text",
    maxLength: 6,
    required: true,
  },
  { key: "phone", section: "contact", type: "tel", maxLength: 40, required: true },
  {
    key: "phoneType",
    section: "contact",
    type: "select",
    options: PHONE_TYPE_OPTS,
    forms: [...PRIMARY],
  },
  { key: "streetNum", section: "contact", type: "text", maxLength: 20, required: true },
  { key: "streetName", section: "contact", type: "text", maxLength: 80, required: true },
  { key: "aptUnit", section: "contact", type: "text", maxLength: 20, forms: [...PRIMARY] },
  { key: "city", section: "contact", type: "text", maxLength: 80, required: true },
  { key: "provinceState", section: "contact", type: "text", maxLength: 40 },
  { key: "country", section: "contact", type: "text", maxLength: 80, required: true },
  { key: "postalCode", section: "contact", type: "text", maxLength: 20, required: true },
  {
    key: "sameAsMailing",
    section: "contact",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "sameAsMailingHelp",
  },
  {
    key: "resStreetNum",
    section: "contact",
    type: "text",
    maxLength: 20,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resStreetName",
    section: "contact",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resAptUnit",
    section: "contact",
    type: "text",
    maxLength: 20,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resCity",
    section: "contact",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resProvinceState",
    section: "contact",
    type: "text",
    maxLength: 40,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resCountry",
    section: "contact",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },
  {
    key: "resPostalCode",
    section: "contact",
    type: "text",
    maxLength: 20,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsMailing", equals: "N" },
  },

  // —— Country of residence ——
  {
    key: "currentCountry",
    section: "residence",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...PRIMARY],
  },
  {
    key: "currentStatus",
    section: "residence",
    type: "select",
    required: true,
    options: STATUS_OPTS,
    forms: [...PRIMARY],
  },
  {
    key: "corFrom",
    section: "residence",
    type: "date",
    forms: [...PRIMARY],
    showWhen: tempStatus,
  },
  {
    key: "corTo",
    section: "residence",
    type: "date",
    forms: [...PRIMARY],
    showWhen: tempStatus,
  },
  {
    key: "corOther",
    section: "residence",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "currentStatus", equals: "06" },
  },
  {
    key: "previousCor",
    section: "residence",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "previousCorHelp",
  },
  {
    key: "sameAsCor",
    section: "residence",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "sameAsCorHelp",
  },
  {
    key: "cwaCountry",
    section: "residence",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsCor", equals: "N" },
  },
  {
    key: "cwaStatus",
    section: "residence",
    type: "select",
    options: STATUS_OPTS,
    forms: [...PRIMARY],
    showWhen: { key: "sameAsCor", equals: "N" },
  },
  {
    key: "cwaOther",
    section: "residence",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: [
      { key: "sameAsCor", equals: "N" },
      { key: "cwaStatus", equals: "06" },
    ],
  },
  {
    key: "cwaFrom",
    section: "residence",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "sameAsCor", equals: "N" },
  },
  {
    key: "cwaTo",
    section: "residence",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "sameAsCor", equals: "N" },
  },

  // —— Passport & ID ——
  {
    key: "passportNumber",
    section: "passport",
    type: "text",
    required: true,
    maxLength: 40,
    forms: [...PRIMARY],
  },
  {
    key: "passportCountry",
    section: "passport",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...PRIMARY],
  },
  {
    key: "passportIssue",
    section: "passport",
    type: "date",
    required: true,
    forms: [...PRIMARY],
  },
  {
    key: "passportExpiry",
    section: "passport",
    type: "date",
    required: true,
    forms: [...PRIMARY],
  },
  {
    key: "hasNatId",
    section: "passport",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "natIdHelp",
  },
  {
    key: "natIdNumber",
    section: "passport",
    type: "text",
    maxLength: 40,
    forms: [...PRIMARY],
    showWhen: { key: "hasNatId", equals: "Y" },
  },
  {
    key: "natIdCountry",
    section: "passport",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "hasNatId", equals: "Y" },
  },
  {
    key: "natIdIssue",
    section: "passport",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "hasNatId", equals: "Y" },
  },
  {
    key: "natIdExpiry",
    section: "passport",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "hasNatId", equals: "Y" },
  },
  {
    key: "hasUsCard",
    section: "passport",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "usCardHelp",
  },
  {
    key: "usCardNumber",
    section: "passport",
    type: "text",
    maxLength: 40,
    forms: [...PRIMARY],
    showWhen: { key: "hasUsCard", equals: "Y" },
  },
  {
    key: "usCardExpiry",
    section: "passport",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "hasUsCard", equals: "Y" },
  },

  // —— Family ——
  {
    key: "spouseFamilyName",
    section: "family",
    type: "text",
    maxLength: 80,
    showWhen: marriedOrCl,
  },
  {
    key: "spouseGivenName",
    section: "family",
    type: "text",
    maxLength: 80,
    showWhen: marriedOrCl,
  },
  {
    key: "marriageDate",
    section: "family",
    type: "date",
    forms: [...PRIMARY],
    showWhen: marriedOrCl,
  },
  {
    key: "spouseDob",
    section: "family",
    type: "date",
    forms: [...FAMILY_FORM, ...PRIMARY],
    showWhen: marriedOrCl,
  },
  {
    key: "spouseCob",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
    showWhen: marriedOrCl,
  },
  {
    key: "spouseAddress",
    section: "family",
    type: "textarea",
    maxLength: 200,
    forms: [...FAMILY_FORM],
    showWhen: marriedOrCl,
    wide: true,
  },
  {
    key: "spouseOccupation",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
    showWhen: marriedOrCl,
  },
  {
    key: "spouseAccompanying",
    section: "family",
    type: "yesno",
    forms: [...FAMILY_FORM],
    showWhen: marriedOrCl,
  },
  {
    key: "previouslyMarried",
    section: "family",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "previouslyMarriedHelp",
  },
  {
    key: "prevSpouseFamilyName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "prevSpouseGivenName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "prevSpouseDob",
    section: "family",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "prevSpouseRelationship",
    section: "family",
    type: "select",
    options: [
      { value: "01", labelKey: "maritalMarried" },
      { value: "03", labelKey: "maritalCommonLaw" },
    ],
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "prevSpouseFrom",
    section: "family",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "prevSpouseTo",
    section: "family",
    type: "date",
    forms: [...PRIMARY],
    showWhen: { key: "previouslyMarried", equals: "Y" },
  },
  {
    key: "parent1FamilyName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent1GivenName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent1Dob",
    section: "family",
    type: "date",
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent1Cob",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent1Address",
    section: "family",
    type: "textarea",
    maxLength: 200,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
    wide: true,
  },
  {
    key: "parent1MaritalStatus",
    section: "family",
    type: "select",
    options: MARITAL_OPTS,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent1Occupation",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent1Telephone",
    section: "family",
    type: "tel",
    maxLength: 40,
    forms: [...CUSTODIAN],
  },
  {
    key: "parent2FamilyName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent2GivenName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent2Dob",
    section: "family",
    type: "date",
    forms: [...FAMILY_FORM, ...CUSTODIAN],
  },
  {
    key: "parent2Cob",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent2Address",
    section: "family",
    type: "textarea",
    maxLength: 200,
    forms: [...FAMILY_FORM, ...CUSTODIAN],
    wide: true,
  },
  {
    key: "parent2MaritalStatus",
    section: "family",
    type: "select",
    options: MARITAL_OPTS,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent2Occupation",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...FAMILY_FORM],
  },
  {
    key: "parent2Telephone",
    section: "family",
    type: "tel",
    maxLength: 40,
    forms: [...CUSTODIAN],
  },
  {
    key: "hasChildren",
    section: "family",
    type: "yesno",
    forms: [...FAMILY_FORM],
    helpKey: "childrenHelp",
  },

  // —— Study ——
  {
    key: "schoolName",
    section: "study",
    type: "text",
    required: true,
    maxLength: 120,
    forms: [...STUDY],
  },
  {
    key: "schoolAddress",
    section: "study",
    type: "textarea",
    required: true,
    maxLength: 200,
    forms: [...STUDY],
    wide: true,
  },
  {
    key: "schoolCity",
    section: "study",
    type: "text",
    required: true,
    maxLength: 80,
    forms: [...STUDY],
  },
  {
    key: "schoolProvince",
    section: "study",
    type: "select",
    required: true,
    options: PROVINCE_OPTS,
    forms: [...STUDY],
  },
  {
    key: "dli",
    section: "study",
    type: "text",
    required: true,
    maxLength: 40,
    forms: [...STUDY],
    helpKey: "dliHelp",
  },
  {
    key: "studyLevel",
    section: "study",
    type: "select",
    required: true,
    options: STUDY_LEVEL_OPTS,
    forms: [...STUDY],
  },
  {
    key: "fieldOfStudy",
    section: "study",
    type: "select",
    required: true,
    options: FIELD_OF_STUDY_OPTS,
    forms: [...STUDY],
  },
  {
    key: "studyFrom",
    section: "study",
    type: "date",
    required: true,
    forms: [...STUDY],
  },
  {
    key: "studyTo",
    section: "study",
    type: "date",
    required: true,
    forms: [...STUDY],
  },
  {
    key: "tuitionAmount",
    section: "study",
    type: "text",
    required: true,
    maxLength: 20,
    forms: [...STUDY],
  },
  {
    key: "availableFunds",
    section: "study",
    type: "text",
    required: true,
    maxLength: 20,
    forms: [...STUDY],
  },
  {
    key: "funds",
    section: "study",
    type: "select",
    required: true,
    options: FUNDS_OPTS,
    forms: [...STUDY],
  },
  {
    key: "fundsOtherPerson",
    section: "study",
    type: "text",
    maxLength: 80,
    forms: [...STUDY],
    showWhen: { key: "funds", equals: "Other" },
  },
  {
    key: "caqNumber",
    section: "study",
    type: "text",
    maxLength: 40,
    forms: [...STUDY],
    showWhen: { key: "schoolProvince", equals: "QC" },
    helpKey: "caqHelp",
  },
  {
    key: "caqExpiry",
    section: "study",
    type: "date",
    forms: [...STUDY],
    showWhen: { key: "schoolProvince", equals: "QC" },
  },
  {
    key: "palNumber",
    section: "study",
    type: "text",
    maxLength: 40,
    forms: [...STUDY],
    helpKey: "palHelp",
  },
  {
    key: "palExpiry",
    section: "study",
    type: "date",
    forms: [...STUDY],
    showWhen: { key: "palNumber", notEquals: "" },
  },

  // —— Work permit details ——
  {
    key: "applicationLocation",
    section: "work",
    type: "select",
    options: [
      { value: "outside", labelKey: "locationOutside" },
      { value: "inside", labelKey: "locationInside" },
    ],
    forms: [...WORK],
    helpKey: "applicationLocationHelp",
  },
  {
    key: "workPermitType",
    section: "work",
    type: "select",
    options: WORK_PERMIT_OPTS,
    forms: [...WORK_OUT],
  },
  {
    key: "employerName",
    section: "work",
    type: "text",
    maxLength: 120,
    forms: [...WORK],
  },
  {
    key: "employerAddress",
    section: "work",
    type: "textarea",
    maxLength: 200,
    forms: [...WORK],
    wide: true,
  },
  {
    key: "jobTitle",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK],
  },
  {
    key: "jobDescription",
    section: "work",
    type: "textarea",
    maxLength: 400,
    forms: [...WORK],
    wide: true,
  },
  {
    key: "workProvince",
    section: "work",
    type: "select",
    options: PROVINCE_OPTS,
    forms: [...WORK],
  },
  {
    key: "workCity",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK],
  },
  {
    key: "workLocationAddress",
    section: "work",
    type: "textarea",
    maxLength: 200,
    forms: [...WORK],
    wide: true,
  },
  {
    key: "workFrom",
    section: "work",
    type: "date",
    forms: [...WORK],
  },
  {
    key: "workTo",
    section: "work",
    type: "date",
    forms: [...WORK],
  },
  {
    key: "lmiaNumber",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...WORK],
    showWhen: { key: "workPermitType", oneOf: ["LMOS", "ELMO"] },
    helpKey: "lmiaHelp",
  },
  {
    key: "workCaqNumber",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...WORK],
    showWhen: { key: "workProvince", equals: "QC" },
  },
  {
    key: "workCaqExpiry",
    section: "work",
    type: "date",
    forms: [...WORK],
    showWhen: { key: "workProvince", equals: "QC" },
  },
  {
    key: "lcpChildCare",
    section: "work",
    type: "checkbox",
    forms: [...WORK_OUT],
    showWhen: { key: "workPermitType", oneOf: ["Other", "OWP"] },
  },
  {
    key: "lcpDisabled",
    section: "work",
    type: "checkbox",
    forms: [...WORK_OUT],
    showWhen: { key: "workPermitType", oneOf: ["Other", "OWP"] },
  },
  {
    key: "lcpElderly",
    section: "work",
    type: "checkbox",
    forms: [...WORK_OUT],
    showWhen: { key: "workPermitType", oneOf: ["Other", "OWP"] },
  },
  {
    key: "lcpOther",
    section: "work",
    type: "checkbox",
    forms: [...WORK_OUT],
    showWhen: { key: "workPermitType", oneOf: ["Other", "OWP"] },
  },
  {
    key: "lcpNoPersons",
    section: "work",
    type: "text",
    maxLength: 10,
    forms: [...WORK_OUT],
    showWhen: { key: "workPermitType", oneOf: ["Other", "OWP"] },
  },
  {
    key: "applyingExtend",
    section: "work",
    type: "checkbox",
    forms: [...WORK_IN],
  },
  {
    key: "applyingRestore",
    section: "work",
    type: "checkbox",
    forms: [...WORK_IN],
  },
  {
    key: "applyingNewEmployer",
    section: "work",
    type: "checkbox",
    forms: [...WORK_IN],
  },
  {
    key: "applyingTrp",
    section: "work",
    type: "checkbox",
    forms: [...WORK_IN],
  },
  {
    key: "origEntryDate",
    section: "work",
    type: "date",
    forms: [...WORK_IN],
  },
  {
    key: "origEntryPlace",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK_IN],
  },
  {
    key: "purposeOfVisit",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK_IN],
  },
  {
    key: "purposeOther",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK_IN],
  },
  {
    key: "recentEntryDate",
    section: "work",
    type: "date",
    forms: [...WORK_IN],
  },
  {
    key: "recentEntryPlace",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK_IN],
  },
  {
    key: "prevDocNum",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...WORK_IN],
  },
  {
    key: "workPurposeType",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...WORK_IN],
  },
  {
    key: "workPurposeOther",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...WORK_IN],
  },
  {
    key: "provNominee",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...WORK_IN],
  },

  // —— Prior education gate ——
  {
    key: "educationIndicator",
    section: "education",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "educationHelp",
  },

  // —— Background ——
  { key: "bgTb", section: "background", type: "yesno", forms: [...PRIMARY], helpKey: "bgTbHelp" },
  {
    key: "bgDisorder",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgMedicalDetails",
    section: "background",
    type: "textarea",
    maxLength: 400,
    forms: [...PRIMARY],
    showWhen: {
      or: [
        { key: "bgTb", equals: "Y" },
        { key: "bgDisorder", equals: "Y" },
      ],
    },
    wide: true,
  },
  {
    key: "bgOverstay",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgRefused",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgClaimAsylum",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgRefusedDetails",
    section: "background",
    type: "textarea",
    maxLength: 400,
    forms: [...PRIMARY],
    showWhen: { key: "bgRefused", equals: "Y" },
    wide: true,
  },
  {
    key: "bgCrime",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgCrimeDetails",
    section: "background",
    type: "textarea",
    maxLength: 400,
    forms: [...PRIMARY],
    showWhen: { key: "bgCrime", equals: "Y" },
    wide: true,
  },
  {
    key: "bgMilitary",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgMilitaryDetails",
    section: "background",
    type: "textarea",
    maxLength: 400,
    forms: [...PRIMARY],
    showWhen: { key: "bgMilitary", equals: "Y" },
    wide: true,
  },
  {
    key: "bgViolence",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "bgWitness",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
  },
  {
    key: "cicContactConsent",
    section: "background",
    type: "yesno",
    forms: [...PRIMARY],
    helpKey: "cicConsentHelp",
  },

  // —— Situation companions ——
  {
    key: "hasDesignee",
    section: "situation",
    type: "yesno",
    forms: [...DESIGNEE],
    helpKey: "designeeHelp",
  },
  {
    key: "designeeFamilyName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "designeeGivenName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "designeeRelationship",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "isCommonLaw",
    section: "situation",
    type: "yesno",
    forms: [...COMMON_LAW],
    helpKey: "commonLawHelp",
  },
  {
    key: "partnerFamilyName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "partnerGivenName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "yearsTogether",
    section: "situation",
    type: "text",
    maxLength: 10,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "commonLawCity",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "commonLawProvince",
    section: "situation",
    type: "text",
    maxLength: 40,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "commonLawCountry",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "commonLawStart",
    section: "situation",
    type: "date",
    forms: [...COMMON_LAW],
    showWhen: { key: "isCommonLaw", equals: "Y" },
  },
  {
    key: "needsCustodian",
    section: "situation",
    type: "yesno",
    forms: [...CUSTODIAN, ...STUDY],
    helpKey: "custodianHelp",
  },
  {
    key: "custodianFamilyName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianGivenName",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianDob",
    section: "situation",
    type: "date",
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianStatus",
    section: "situation",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianAddress",
    section: "situation",
    type: "textarea",
    maxLength: 200,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
    wide: true,
  },
  {
    key: "custodianTelephone",
    section: "situation",
    type: "tel",
    maxLength: 40,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
];

/** Table-style repeatable blocks. */
export const REPEATABLE_TABLES: RepeatableTable[] = [
  {
    key: "previousCorRows",
    section: "residence",
    forms: [...PRIMARY],
    showWhen: { key: "previousCor", equals: "Y" },
    maxRows: 2,
    minRows: 1,
    helpKey: "previousCorRowsHelp",
    columns: [
      { key: "country", type: "text", labelKey: "colCountry", maxLength: 80, required: true },
      {
        key: "status",
        type: "select",
        labelKey: "colStatus",
        options: STATUS_OPTS,
        required: true,
      },
      { key: "other", type: "text", labelKey: "colStatusOther", maxLength: 80 },
      { key: "from", type: "date", labelKey: "colFrom", required: true },
      { key: "to", type: "date", labelKey: "colTo", required: true },
    ],
  },
  {
    key: "jobs",
    section: "employment",
    forms: [...PRIMARY],
    maxRows: 3,
    minRows: 1,
    helpKey: "jobsHelp",
    columns: [
      { key: "occupation", type: "text", labelKey: "colOccupation", maxLength: 80, required: true },
      { key: "employer", type: "text", labelKey: "colEmployer", maxLength: 120, required: true },
      { key: "city", type: "text", labelKey: "colCity", maxLength: 80, required: true },
      { key: "country", type: "text", labelKey: "colCountry", maxLength: 80, required: true },
      { key: "provinceState", type: "text", labelKey: "colProvince", maxLength: 40 },
      { key: "from", type: "month", labelKey: "colFromMonth", required: true },
      { key: "to", type: "month", labelKey: "colToMonth" },
    ],
  },
  {
    key: "educationRows",
    section: "education",
    forms: [...PRIMARY],
    showWhen: { key: "educationIndicator", equals: "Y" },
    maxRows: 3,
    minRows: 1,
    helpKey: "educationRowsHelp",
    columns: [
      { key: "school", type: "text", labelKey: "colSchool", maxLength: 120, required: true },
      {
        key: "fieldOfStudy",
        type: "text",
        labelKey: "colFieldOfStudy",
        maxLength: 80,
        required: true,
      },
      { key: "city", type: "text", labelKey: "colCity", maxLength: 80, required: true },
      { key: "country", type: "text", labelKey: "colCountry", maxLength: 80, required: true },
      { key: "provinceState", type: "text", labelKey: "colProvince", maxLength: 40 },
      { key: "from", type: "month", labelKey: "colFromMonth", required: true },
      { key: "to", type: "month", labelKey: "colToMonth", required: true },
    ],
  },
  {
    key: "children",
    section: "family",
    forms: [...FAMILY_FORM],
    showWhen: { key: "hasChildren", equals: "Y" },
    maxRows: 8,
    minRows: 1,
    helpKey: "childrenRowsHelp",
    columns: [
      { key: "familyName", type: "text", labelKey: "colFamilyName", maxLength: 80, required: true },
      { key: "givenName", type: "text", labelKey: "colGivenName", maxLength: 80, required: true },
      { key: "dob", type: "date", labelKey: "colDob", required: true },
      { key: "cob", type: "text", labelKey: "colCob", maxLength: 80 },
      { key: "relationship", type: "text", labelKey: "colRelationship", maxLength: 40 },
      {
        key: "accompanying",
        type: "yesno",
        labelKey: "colAccompanying",
      },
      { key: "address", type: "text", labelKey: "colAddress", maxLength: 120 },
      { key: "occupation", type: "text", labelKey: "colOccupation", maxLength: 80 },
    ],
  },
];

export function questionnaireFormCodes(formCodes: string[]): string[] {
  return formCodes
    .map((c) => c.toLowerCase())
    .filter((c) => !CHECKLIST_FORM_CODES.has(c));
}

export function matchesShowWhen(
  rule: ShowWhenRule | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return true;
  if ("or" in rule && Array.isArray(rule.or)) {
    return rule.or.some((r) => matchesShowWhen(r, answers));
  }
  const rules = Array.isArray(rule) ? rule : [rule as ShowWhen];
  return rules.every((r) => {
    const raw = answers[r.key];
    const value = raw === undefined || raw === null ? "" : String(raw);
    if (r.equals !== undefined) return value === r.equals;
    if (r.notEquals !== undefined) return value !== r.notEquals;
    if (r.oneOf) return r.oneOf.includes(value);
    return true;
  });
}

export function fieldsForFormCodes(formCodes: string[]): CanonicalField[] {
  const set = new Set(questionnaireFormCodes(formCodes));
  return CANONICAL_FIELDS.filter((field) => {
    if (!field.forms || field.forms.length === 0) return true;
    return field.forms.some((f) => set.has(f));
  });
}

export function tablesForFormCodes(formCodes: string[]): RepeatableTable[] {
  const set = new Set(questionnaireFormCodes(formCodes));
  return REPEATABLE_TABLES.filter((table) => {
    if (!table.forms || table.forms.length === 0) return true;
    return table.forms.some((f) => set.has(f));
  });
}

export function sectionsForFields(
  fields: CanonicalField[],
  tables: RepeatableTable[] = [],
): QuestionnaireSection[] {
  const present = new Set([
    ...fields.map((f) => f.section),
    ...tables.map((t) => t.section),
  ]);
  return QUESTIONNAIRE_SECTIONS.filter((s) => present.has(s));
}

export function isFieldVisible(
  field: CanonicalField,
  answers: Record<string, unknown>,
): boolean {
  return matchesShowWhen(field.showWhen, answers);
}

export function isTableVisible(
  table: RepeatableTable,
  answers: Record<string, unknown>,
): boolean {
  return matchesShowWhen(table.showWhen, answers);
}

/** Split ISO date into year/month/day for PDF fillers. */
export function expandDobAnswers(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...answers, hasRepresentative: true };
  const dob = String(answers.dob || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (m) {
    next.dobYear = m[1];
    next.dobMonth = m[2];
    next.dobDay = m[3];
  }
  return next;
}

export function emptyTableRow(table: RepeatableTable): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of table.columns) {
    row[col.key] = col.type === "checkbox" ? "N" : "";
  }
  return row;
}
