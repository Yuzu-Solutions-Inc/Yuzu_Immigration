/**
 * Ask-once field registry for IRCC forms (excludes document checklists).
 * Select values are IRCC LOV `lic` codes so filled PDFs stay DocMDP-certifiable.
 * Labels: messages → forms.fields.* / forms.tables.* / forms.options.*
 */

import countriesEn from "./codes/countries-en.json";
import countriesFr from "./codes/countries-fr.json";
import languagesEn from "./codes/languages-en.json";
import languagesFr from "./codes/languages-fr.json";

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

export type FieldOption = {
  value: string;
  labelKey?: string;
  /** Official IRCC English list label. */
  label?: string;
  /** Official IRCC French list label (same `lic` as `label`). */
  labelFr?: string;
  /** Keep at the top of long LOV lists (e.g. English/French). */
  pin?: boolean;
};

export function fieldOptionLabel(
  opt: FieldOption,
  locale: string,
  translate: (key: string) => string,
): string {
  if (locale.startsWith("fr") && opt.labelFr) return opt.labelFr;
  if (opt.label) return opt.label;
  if (opt.labelKey) return translate(`options.${opt.labelKey}`);
  return opt.value;
}

export function orderedFieldOptions(
  options: FieldOption[],
  locale: string,
  translate: (key: string) => string,
): FieldOption[] {
  const pinned = options.filter((opt) => opt.pin);
  const rest = options.filter((opt) => !opt.pin);
  if (locale.startsWith("fr") && rest.some((opt) => opt.labelFr)) {
    rest.sort((a, b) =>
      fieldOptionLabel(a, locale, translate).localeCompare(
        fieldOptionLabel(b, locale, translate),
        "fr",
      ),
    );
  }
  return [...pinned, ...rest];
}

export type CanonicalField = {
  key: string;
  section: string;
  type: FieldType;
  required?: boolean;
  maxLength?: number;
  options?: FieldOption[];
  showWhen?: ShowWhenRule;
  forms?: string[];
  helpKey?: string;
  /** Wider layout */
  wide?: boolean;
  /** Stored and derived, never shown in the questionnaire. */
  hidden?: boolean;
};

export type TableColumn = {
  key: string;
  type: FieldType;
  labelKey: string;
  maxLength?: number;
  options?: FieldOption[];
  required?: boolean;
  /** i18n key under forms.placeholders.* */
  placeholderKey?: string;
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
  /** Defaults to true. Family member lists stay in given order. */
  reorderable?: boolean;
};

export type QuestionnaireFieldGroup = {
  key: string;
  section: string;
  fieldKeys: string[];
  /** Single-row compact controls instead of a wrapped card. */
  layout?: "inline";
};

export const QUESTIONNAIRE_SECTIONS = [
  "identity",
  "contact",
  "residence",
  "passport",
  "family",
  "study",
  "work",
  "visit",
  "employment",
  "education",
  "background",
] as const;

export type QuestionnaireSection = (typeof QUESTIONNAIRE_SECTIONS)[number];

/** Document checklists — never drive questionnaire fields. */
export const CHECKLIST_FORM_CODES = new Set([
  "imm5483",
  "imm5488",
  "imm5556",
]);

const PRIMARY = [
  "imm1294",
  "imm1295",
  "imm5257",
  "imm5257sch1",
  "imm5708",
  "imm5709",
  "imm5710",
] as const;
const STUDY = ["imm1294", "imm5709"] as const;
const WORK = ["imm1295", "imm5710"] as const;
const VISITOR = ["imm5257", "imm5257sch1", "imm5708"] as const;
const VISITOR_IN = ["imm5708"] as const;
const VISITOR_OUT = ["imm5257", "imm5257sch1"] as const;
const WORK_IN = ["imm5710"] as const;
const WORK_OUT = ["imm1295"] as const;
const IN_CANADA = ["imm5709", "imm5710"] as const;
const FAMILY_FORM = ["imm5707", "imm5645", "imm5406"] as const;
const FAMILY_OUT = ["imm5645", "imm5406"] as const;
const CUSTODIAN = ["imm5646"] as const;
const DESIGNEE = ["imm5475"] as const;
const COMMON_LAW = ["imm5409"] as const;

function lovOptions(
  en: Record<string, string>,
  fr: Record<string, string>,
  pin: string[] = [],
): FieldOption[] {
  const codes = [
    ...new Set([...Object.keys(en), ...Object.keys(fr)]),
  ].filter((value) => /^\d{3}$/.test(value));
  const pinned = new Set(pin);
  const toOpt = (value: string): FieldOption => ({
    value,
    label: en[value] || fr[value],
    labelFr: fr[value] || en[value],
    pin: pinned.has(value) || undefined,
  });
  const rest = codes
    .filter((value) => !pinned.has(value))
    .sort((a, b) =>
      (en[a] || fr[a] || a).localeCompare(en[b] || fr[b] || b, "en"),
    );
  return [
    ...pin.filter((value) => codes.includes(value)).map(toOpt),
    ...rest.map(toOpt),
  ];
}

const SEX_OPTS: FieldOption[] = [
  { value: "Female", labelKey: "sexFemale" },
  { value: "Male", labelKey: "sexMale" },
  { value: "Unknown", labelKey: "sexUnknown" },
  { value: "Unspecified", labelKey: "sexUnspecified" },
];

const MARITAL_OPTS: FieldOption[] = [
  { value: "02", labelKey: "maritalSingle" },
  { value: "01", labelKey: "maritalMarried" },
  { value: "03", labelKey: "maritalCommonLaw" },
  { value: "04", labelKey: "maritalDivorced" },
  { value: "05", labelKey: "maritalSeparated" },
  { value: "06", labelKey: "maritalWidowed" },
  { value: "09", labelKey: "maritalAnnulled" },
  { value: "00", labelKey: "maritalUnknown" },
];

/** IMM 1294/1295/5710 ImmigrationStatus — 04 is Worker, 05 is Student. */
const STATUS_OPTS: FieldOption[] = [
  { value: "01", labelKey: "statusCitizen" },
  { value: "02", labelKey: "statusPR" },
  { value: "03", labelKey: "statusVisitor" },
  { value: "04", labelKey: "statusWorker" },
  { value: "05", labelKey: "statusStudent" },
  { value: "06", labelKey: "statusOther" },
  { value: "07", labelKey: "statusProtected" },
  { value: "08", labelKey: "statusRefugee" },
  { value: "09", labelKey: "statusForeignNational" },
];

const PHONE_TYPE_OPTS: FieldOption[] = [
  { value: "02", labelKey: "phoneCellular" },
  { value: "01", labelKey: "phoneResidence" },
  { value: "03", labelKey: "phoneBusiness" },
  { value: "05", labelKey: "phoneOther" },
];

const PROVINCE_OPTS: FieldOption[] = [
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

const STUDY_LEVEL_OPTS: FieldOption[] = [
  { value: "01", labelKey: "studyPrimary" },
  { value: "02", labelKey: "studySecondary" },
  { value: "10", labelKey: "studyPtc" },
  { value: "11", labelKey: "studyCegepPre" },
  { value: "12", labelKey: "studyCegepTech" },
  { value: "13", labelKey: "studyCollegeCert" },
  { value: "14", labelKey: "studyCollegeDip" },
  { value: "15", labelKey: "studyCollegeApplied" },
  { value: "04", labelKey: "studyBachelor" },
  { value: "05", labelKey: "studyMaster" },
  { value: "06", labelKey: "studyDoctorate" },
  { value: "07", labelKey: "studyUniOther" },
  { value: "16", labelKey: "studyEsl" },
  { value: "17", labelKey: "studyEslCollege" },
  { value: "18", labelKey: "studyEslUni" },
  { value: "08", labelKey: "studyOther" },
  { value: "19", labelKey: "studyNa" },
];

const FIELD_OF_STUDY_OPTS: FieldOption[] = [
  { value: "01", labelKey: "fosArtsSocial" },
  { value: "02", labelKey: "fosArtsFine" },
  { value: "03", labelKey: "fosBusiness" },
  { value: "04", labelKey: "fosComputing" },
  { value: "05", labelKey: "fosEsl" },
  { value: "06", labelKey: "fosFlight" },
  { value: "07", labelKey: "fosHospitality" },
  { value: "08", labelKey: "fosLaw" },
  { value: "09", labelKey: "fosMedicine" },
  { value: "10", labelKey: "fosScienceApplied" },
  { value: "11", labelKey: "fosScienceGeneral" },
  { value: "12", labelKey: "fosScienceHealth" },
  { value: "13", labelKey: "fosTrades" },
  { value: "14", labelKey: "fosTheology" },
  { value: "15", labelKey: "fosOther" },
  { value: "16", labelKey: "fosAgric" },
  { value: "17", labelKey: "fosArchitecture" },
  { value: "18", labelKey: "fosBio" },
  { value: "19", labelKey: "fosBusinessMgmt" },
];

const FUNDS_OPTS: FieldOption[] = [
  { value: "Myself", labelKey: "fundsMyself" },
  { value: "Parents", labelKey: "fundsParents" },
  { value: "Other", labelKey: "fundsOther" },
];

const LANG_OPTS: FieldOption[] = [
  { value: "English", labelKey: "langEnglish" },
  { value: "French", labelKey: "langFrench" },
  { value: "Both", labelKey: "langBoth" },
  { value: "Neither", labelKey: "langNeither" },
];

const PREF_LANG_OPTS: FieldOption[] = [
  { value: "English", labelKey: "langEnglish" },
  { value: "French", labelKey: "langFrench" },
];

const WORK_PERMIT_OPTS: FieldOption[] = [
  { value: "LMOS", labelKey: "wpLmos" },
  { value: "ELMO", labelKey: "wpElmo" },
  { value: "OWP", labelKey: "wpOwp" },
  { value: "SAWP", labelKey: "wpSawp" },
  { value: "SBC", labelKey: "wpSbc" },
  { value: "Other", labelKey: "wpOther" },
];

const WORK_PERMIT_INLAND_OPTS: FieldOption[] = [
  { value: "LMOS", labelKey: "wpLmos" },
  { value: "ELMO", labelKey: "wpElmo" },
  { value: "OWP", labelKey: "wpOwp" },
  { value: "PGWP", labelKey: "wpPgwp" },
  { value: "COWP", labelKey: "wpCowp" },
  { value: "LCP", labelKey: "wpLcp" },
  { value: "VWOWP", labelKey: "wpVwowp" },
  { value: "SBC", labelKey: "wpSbc" },
  { value: "Other", labelKey: "wpOther" },
];

const VISIT_PURPOSE_OPTS: FieldOption[] = [
  { value: "01", labelKey: "visitBusiness" },
  { value: "02", labelKey: "visitTourism" },
  { value: "08", labelKey: "visitFamily" },
  { value: "13", labelKey: "visitVisit" },
  { value: "04", labelKey: "visitShortStudy" },
  { value: "05", labelKey: "visitReturningStudent" },
  { value: "06", labelKey: "visitReturningWorker" },
  { value: "07", labelKey: "visitSuperVisa" },
  { value: "03", labelKey: "visitOther" },
];

const VISIT_PURPOSE_ORIGINAL_OPTS: FieldOption[] = [
  { value: "01", labelKey: "visitBusiness" },
  { value: "02", labelKey: "visitTourism" },
  { value: "06", labelKey: "visitFamily" },
  { value: "04", labelKey: "visitStudy" },
  { value: "05", labelKey: "visitWork" },
  { value: "03", labelKey: "visitOther" },
];

const CHILD_REL_OPTS: FieldOption[] = [
  { value: "son", labelKey: "relSon" },
  { value: "daughter", labelKey: "relDaughter" },
  { value: "stepSon", labelKey: "relStepSon" },
  { value: "stepDaughter", labelKey: "relStepDaughter" },
  { value: "adoptedSon", labelKey: "relAdoptedSon" },
  { value: "adoptedDaughter", labelKey: "relAdoptedDaughter" },
];

const SIBLING_REL_OPTS: FieldOption[] = [
  { value: "brother", labelKey: "relBrother" },
  { value: "sister", labelKey: "relSister" },
  { value: "halfBrother", labelKey: "relHalfBrother" },
  { value: "halfSister", labelKey: "relHalfSister" },
  { value: "stepBrother", labelKey: "relStepBrother" },
  { value: "stepSister", labelKey: "relStepSister" },
];

const COUNTRY_OPTS = lovOptions(
  countriesEn as Record<string, string>,
  countriesFr as Record<string, string>,
);
const LANGUAGE_OPTS = lovOptions(
  languagesEn as Record<string, string>,
  languagesFr as Record<string, string>,
  ["001", "002"],
);

/** Option lists the Sunday IRCC validator compares to live PDF choice codes. */
export const QUESTIONNAIRE_LOVS = {
  sex: SEX_OPTS,
  marital: MARITAL_OPTS,
  status: STATUS_OPTS,
  phone: PHONE_TYPE_OPTS,
  studyLevel: STUDY_LEVEL_OPTS,
  fieldOfStudy: FIELD_OF_STUDY_OPTS,
  funds: FUNDS_OPTS,
  communicate: LANG_OPTS,
  preferredLang: PREF_LANG_OPTS,
  workPermit: WORK_PERMIT_OPTS,
  workPermitInland: WORK_PERMIT_INLAND_OPTS,
  visitPurpose: VISIT_PURPOSE_OPTS,
  visitPurposeOriginal: VISIT_PURPOSE_ORIGINAL_OPTS,
  childRel: CHILD_REL_OPTS,
  siblingRel: SIBLING_REL_OPTS,
  country: COUNTRY_OPTS,
  language: LANGUAGE_OPTS,
} as const;

const marriedOrCl: ShowWhen = {
  key: "maritalStatus",
  oneOf: ["01", "03"],
};
const marriedOnly: ShowWhen = {
  key: "maritalStatus",
  equals: "01",
};
const commonLawOnly: ShowWhen = {
  key: "maritalStatus",
  equals: "03",
};
const tempStatus: ShowWhen = {
  key: "currentStatus",
  oneOf: ["03", "04", "05", "06", "07", "08", "09"],
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
    type: "select",
    required: true,
    options: COUNTRY_OPTS,
    helpKey: "countryHelp",
  },
  {
    key: "citizenship",
    section: "identity",
    type: "select",
    required: true,
    options: COUNTRY_OPTS,
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
    type: "select",
    required: true,
    options: LANGUAGE_OPTS,
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
  { key: "country", section: "contact", type: "select", required: true, options: COUNTRY_OPTS },
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
    type: "select",
    options: COUNTRY_OPTS,
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
    type: "select",
    required: true,
    options: COUNTRY_OPTS,
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
    type: "select",
    options: COUNTRY_OPTS,
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
    type: "select",
    required: true,
    options: COUNTRY_OPTS,
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
    type: "select",
    options: COUNTRY_OPTS,
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
    showWhen: marriedOnly,
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
    type: "select",
    options: COUNTRY_OPTS,
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
    key: "yearsTogether",
    section: "family",
    type: "text",
    maxLength: 10,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    showWhen: commonLawOnly,
  },
  {
    key: "commonLawStart",
    section: "family",
    type: "date",
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    showWhen: commonLawOnly,
  },
  {
    key: "commonLawCity",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    showWhen: commonLawOnly,
  },
  {
    key: "commonLawProvince",
    section: "family",
    type: "text",
    maxLength: 40,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    showWhen: commonLawOnly,
  },
  {
    key: "commonLawCountry",
    section: "family",
    type: "select",
    options: COUNTRY_OPTS,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    showWhen: commonLawOnly,
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
    type: "select",
    options: COUNTRY_OPTS,
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
    type: "select",
    options: COUNTRY_OPTS,
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
  {
    key: "hasSiblings",
    section: "family",
    type: "yesno",
    forms: [...FAMILY_OUT],
    helpKey: "siblingsHelp",
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

  // —— Visitor ——
  {
    key: "visitPurpose",
    section: "visit",
    type: "select",
    required: true,
    options: VISIT_PURPOSE_OPTS,
    forms: [...VISITOR],
  },
  {
    key: "visitPurposeOther",
    section: "visit",
    type: "text",
    maxLength: 80,
    forms: [...VISITOR],
    showWhen: { key: "visitPurpose", equals: "03" },
  },
  {
    key: "visitFrom",
    section: "visit",
    type: "date",
    required: true,
    forms: [...VISITOR_OUT],
  },
  {
    key: "visitTo",
    section: "visit",
    type: "date",
    required: true,
    forms: [...VISITOR_OUT],
  },
  {
    key: "visitHostName",
    section: "visit",
    type: "text",
    maxLength: 120,
    forms: [...VISITOR],
  },
  {
    key: "visitHostRelationship",
    section: "visit",
    type: "text",
    maxLength: 80,
    forms: [...VISITOR],
  },
  {
    key: "visitFunds",
    section: "visit",
    type: "select",
    options: FUNDS_OPTS,
    forms: [...VISITOR],
  },
  {
    key: "visitorApplyExtend",
    section: "visit",
    type: "checkbox",
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorApplyRestore",
    section: "visit",
    type: "checkbox",
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorOrigEntryDate",
    section: "visit",
    type: "date",
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorOrigEntryPlace",
    section: "visit",
    type: "text",
    maxLength: 80,
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorRecentEntryDate",
    section: "visit",
    type: "date",
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorRecentEntryPlace",
    section: "visit",
    type: "text",
    maxLength: 80,
    forms: [...VISITOR_IN],
  },
  {
    key: "visitorPrevDocNum",
    section: "visit",
    type: "text",
    maxLength: 40,
    forms: [...VISITOR_IN],
  },

  // —— Work permit details ——
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
    forms: [...IN_CANADA],
  },
  {
    key: "applyingRestore",
    section: "work",
    type: "checkbox",
    forms: [...IN_CANADA],
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
    forms: [...IN_CANADA],
  },
  {
    key: "origEntryDate",
    section: "work",
    type: "date",
    forms: [...IN_CANADA],
  },
  {
    key: "origEntryPlace",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...IN_CANADA],
  },
  {
    key: "purposeOfVisit",
    section: "work",
    type: "select",
    options: VISIT_PURPOSE_ORIGINAL_OPTS,
    forms: [...IN_CANADA],
  },
  {
    key: "purposeOther",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...IN_CANADA],
    showWhen: { key: "purposeOfVisit", equals: "03" },
  },
  {
    key: "recentEntryDate",
    section: "work",
    type: "date",
    forms: [...IN_CANADA],
  },
  {
    key: "recentEntryPlace",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: [...IN_CANADA],
  },
  {
    key: "prevDocNum",
    section: "work",
    type: "text",
    maxLength: 40,
    forms: [...IN_CANADA],
  },
  {
    key: "workPurposeType",
    section: "work",
    type: "select",
    options: WORK_PERMIT_INLAND_OPTS,
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

  // —— Companions (designee, common-law, custodian) ——
  {
    key: "hasDesignee",
    section: "identity",
    type: "yesno",
    forms: [...DESIGNEE],
    helpKey: "designeeHelp",
  },
  {
    key: "designeeFamilyName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "designeeGivenName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "designeeRelationship",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...DESIGNEE],
    showWhen: { key: "hasDesignee", equals: "Y" },
  },
  {
    key: "isCommonLaw",
    section: "identity",
    type: "yesno",
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    helpKey: "commonLawHelp",
    /** Derived from maritalStatus (03 = common-law). */
    hidden: true,
  },
  {
    key: "partnerFamilyName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    /** Same person as spouseFamilyName. */
    hidden: true,
  },
  {
    key: "partnerGivenName",
    section: "family",
    type: "text",
    maxLength: 80,
    forms: [...WORK, ...STUDY, ...VISITOR, ...COMMON_LAW],
    hidden: true,
  },
  {
    key: "needsCustodian",
    section: "identity",
    type: "yesno",
    forms: [...CUSTODIAN, ...STUDY],
    helpKey: "custodianHelp",
  },
  {
    key: "custodianFamilyName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianGivenName",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianDob",
    section: "identity",
    type: "date",
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianStatus",
    section: "identity",
    type: "text",
    maxLength: 80,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
  },
  {
    key: "custodianAddress",
    section: "identity",
    type: "textarea",
    maxLength: 200,
    forms: [...CUSTODIAN],
    showWhen: { key: "needsCustodian", equals: "Y" },
    wide: true,
  },
  {
    key: "custodianTelephone",
    section: "identity",
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
      { key: "country", type: "select", labelKey: "colCountry", options: COUNTRY_OPTS, required: true },
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
      { key: "country", type: "select", labelKey: "colCountry", options: COUNTRY_OPTS, required: true },
      {
        key: "provinceState",
        type: "text",
        labelKey: "colProvince",
        maxLength: 40,
        placeholderKey: "ifApplicable",
      },
      { key: "from", type: "month", labelKey: "colFrom", required: true },
      { key: "to", type: "month", labelKey: "colTo" },
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
      { key: "country", type: "select", labelKey: "colCountry", options: COUNTRY_OPTS, required: true },
      {
        key: "provinceState",
        type: "text",
        labelKey: "colProvince",
        maxLength: 40,
        placeholderKey: "ifApplicable",
      },
      { key: "from", type: "month", labelKey: "colFrom", required: true },
      { key: "to", type: "month", labelKey: "colTo", required: true },
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
    reorderable: false,
    columns: [
      { key: "familyName", type: "text", labelKey: "colFamilyName", maxLength: 80, required: true },
      { key: "givenName", type: "text", labelKey: "colGivenName", maxLength: 80, required: true },
      { key: "dob", type: "date", labelKey: "colDob", required: true },
      { key: "cob", type: "select", labelKey: "colCob", options: COUNTRY_OPTS },
      { key: "relationship", type: "select", labelKey: "colRelationship", options: CHILD_REL_OPTS },
      {
        key: "accompanying",
        type: "yesno",
        labelKey: "colAccompanying",
      },
      { key: "address", type: "text", labelKey: "colAddress", maxLength: 120 },
      { key: "occupation", type: "text", labelKey: "colOccupation", maxLength: 80 },
    ],
  },
  {
    key: "siblings",
    section: "family",
    forms: [...FAMILY_OUT],
    showWhen: { key: "hasSiblings", equals: "Y" },
    maxRows: 3,
    minRows: 1,
    helpKey: "siblingsRowsHelp",
    reorderable: false,
    columns: [
      { key: "familyName", type: "text", labelKey: "colFamilyName", maxLength: 80, required: true },
      { key: "givenName", type: "text", labelKey: "colGivenName", maxLength: 80, required: true },
      { key: "relationship", type: "select", labelKey: "colRelationship", options: SIBLING_REL_OPTS, required: true },
      { key: "dob", type: "date", labelKey: "colDob" },
      { key: "cob", type: "select", labelKey: "colCob", options: COUNTRY_OPTS },
      {
        key: "maritalStatus",
        type: "select",
        labelKey: "colMaritalStatus",
        options: MARITAL_OPTS,
      },
      { key: "address", type: "text", labelKey: "colAddress", maxLength: 120 },
    ],
  },
];

export const FIELD_GROUPS: QuestionnaireFieldGroup[] = [
  {
    key: "phone",
    section: "contact",
    layout: "inline",
    fieldKeys: ["phoneCountryCode", "phone", "phoneType"],
  },
  {
    key: "spouse",
    section: "family",
    fieldKeys: [
      "spouseFamilyName",
      "spouseGivenName",
      "marriageDate",
      "spouseDob",
      "spouseCob",
      "spouseOccupation",
      "spouseAccompanying",
      "spouseAddress",
      "yearsTogether",
      "commonLawStart",
      "commonLawCity",
      "commonLawProvince",
      "commonLawCountry",
    ],
  },
  {
    key: "prevSpouse",
    section: "family",
    fieldKeys: [
      "prevSpouseFamilyName",
      "prevSpouseGivenName",
      "prevSpouseDob",
      "prevSpouseRelationship",
      "prevSpouseFrom",
      "prevSpouseTo",
    ],
  },
  {
    key: "parent1",
    section: "family",
    fieldKeys: [
      "parent1FamilyName",
      "parent1GivenName",
      "parent1Dob",
      "parent1Cob",
      "parent1MaritalStatus",
      "parent1Occupation",
      "parent1Telephone",
      "parent1Address",
    ],
  },
  {
    key: "parent2",
    section: "family",
    fieldKeys: [
      "parent2FamilyName",
      "parent2GivenName",
      "parent2Dob",
      "parent2Cob",
      "parent2MaritalStatus",
      "parent2Occupation",
      "parent2Telephone",
      "parent2Address",
    ],
  },
  {
    key: "mailingAddress",
    section: "contact",
    fieldKeys: [
      "streetNum",
      "streetName",
      "aptUnit",
      "city",
      "provinceState",
      "country",
      "postalCode",
    ],
  },
  {
    key: "residentialAddress",
    section: "contact",
    fieldKeys: [
      "resStreetNum",
      "resStreetName",
      "resAptUnit",
      "resCity",
      "resProvinceState",
      "resCountry",
      "resPostalCode",
    ],
  },
];

export function fieldGroupForKey(key: string): QuestionnaireFieldGroup | undefined {
  return FIELD_GROUPS.find((group) => group.fieldKeys.includes(key));
}

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

export function showWhenClauses(rule?: ShowWhenRule): ShowWhen[] {
  if (!rule) return [];
  if (Array.isArray(rule)) return rule;
  if ("or" in rule) return rule.or;
  return [rule];
}

/** Most specific gate: last AND clause, or first OR clause. */
export function primaryGateKey(rule?: ShowWhenRule): string | undefined {
  const clauses = showWhenClauses(rule);
  if (clauses.length === 0) return undefined;
  if (rule && "or" in rule && Array.isArray(rule.or)) return clauses[0]?.key;
  return clauses[clauses.length - 1]?.key;
}

export function isGatedByParent(
  rule: ShowWhenRule | undefined,
  parentKey: string,
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return false;
  if ("or" in rule && Array.isArray(rule.or)) {
    return rule.or.some(
      (clause) => clause.key === parentKey && matchesShowWhen(clause, answers),
    );
  }
  return primaryGateKey(rule) === parentKey;
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
  if (field.hidden) return false;
  return matchesShowWhen(field.showWhen, answers);
}

/**
 * Common-law on IRCC forms is marital status 03.
 * Married (01) already answers the partner question — do not also ask isCommonLaw.
 */
export function deriveIsCommonLaw(
  maritalStatus: unknown,
  fallback?: unknown,
): "Y" | "N" {
  const marital = String(maritalStatus ?? "").trim();
  if (marital === "03") return "Y";
  if (marital === "01" || marital === "02" || marital === "04" || marital === "05" || marital === "06") {
    return "N";
  }
  const v = String(fallback ?? "").trim().toUpperCase();
  return v === "Y" || v === "YES" || v === "TRUE" || v === "1" ? "Y" : "N";
}

export function applyDerivedAnswers(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const spouseFamily = String(answers.spouseFamilyName ?? "").trim();
  const spouseGiven = String(answers.spouseGivenName ?? "").trim();
  return {
    ...answers,
    isCommonLaw: deriveIsCommonLaw(answers.maritalStatus, answers.isCommonLaw),
    partnerFamilyName: spouseFamily || answers.partnerFamilyName || "",
    partnerGivenName: spouseGiven || answers.partnerGivenName || "",
  };
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
