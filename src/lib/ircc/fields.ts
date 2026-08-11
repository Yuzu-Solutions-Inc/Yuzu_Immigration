export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "select"
  | "yesno"
  | "textarea";

export type CanonicalField = {
  key: string;
  section: string;
  type: FieldType;
  required?: boolean;
  /** Max length for text inputs */
  maxLength?: number;
  options?: Array<{ value: string; labelKey: string }>;
  /** Show when this answer equals value */
  showWhen?: { key: string; equals: string };
  /** Forms that need this field (for progress / filtering) */
  forms?: string[];
  helpKey?: string;
};

export const QUESTIONNAIRE_SECTIONS = [
  "basics",
  "identity",
  "contact",
  "family",
  "situation",
  "study",
  "work",
] as const;

export type QuestionnaireSection = (typeof QUESTIONNAIRE_SECTIONS)[number];

/** Ask-once field registry. Labels live in messages under forms.fields.* */
export const CANONICAL_FIELDS: CanonicalField[] = [
  // formLanguage comes from immigration_projects.form_language (not asked here).
  {
    key: "email",
    section: "basics",
    type: "email",
    required: true,
    maxLength: 120,
  },
  {
    key: "familyName",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
  },
  {
    key: "givenName",
    section: "identity",
    type: "text",
    required: true,
    maxLength: 80,
  },
  {
    key: "sex",
    section: "identity",
    type: "select",
    required: true,
    options: [
      { value: "Female", labelKey: "sexFemale" },
      { value: "Male", labelKey: "sexMale" },
      { value: "Unknown", labelKey: "sexUnknown" },
    ],
  },
  {
    key: "dob",
    section: "identity",
    type: "date",
    required: true,
    helpKey: "dobHelp",
  },
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
    options: [
      { value: "02", labelKey: "maritalSingle" },
      { value: "01", labelKey: "maritalMarried" },
      { value: "03", labelKey: "maritalCommonLaw" },
      { value: "04", labelKey: "maritalDivorced" },
      { value: "05", labelKey: "maritalSeparated" },
      { value: "06", labelKey: "maritalWidowed" },
    ],
  },
  {
    key: "phoneCountryCode",
    section: "contact",
    type: "text",
    maxLength: 6,
  },
  {
    key: "phone",
    section: "contact",
    type: "tel",
    maxLength: 40,
  },
  {
    key: "streetNum",
    section: "contact",
    type: "text",
    maxLength: 20,
  },
  {
    key: "streetName",
    section: "contact",
    type: "text",
    maxLength: 80,
  },
  {
    key: "city",
    section: "contact",
    type: "text",
    maxLength: 80,
  },
  {
    key: "provinceState",
    section: "contact",
    type: "text",
    maxLength: 40,
  },
  {
    key: "country",
    section: "contact",
    type: "text",
    maxLength: 80,
  },
  {
    key: "postalCode",
    section: "contact",
    type: "text",
    maxLength: 20,
  },
  {
    key: "parent1FamilyName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: ["imm5707", "imm5646"],
  },
  {
    key: "parent1GivenName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: ["imm5707", "imm5646"],
  },
  {
    key: "parent2FamilyName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: ["imm5707"],
  },
  {
    key: "parent2GivenName",
    section: "family",
    type: "text",
    required: true,
    maxLength: 80,
    forms: ["imm5707"],
  },
  {
    key: "spouseFamilyName",
    section: "family",
    type: "text",
    maxLength: 80,
    showWhen: { key: "maritalStatus", equals: "01" },
  },
  {
    key: "spouseGivenName",
    section: "family",
    type: "text",
    maxLength: 80,
    showWhen: { key: "maritalStatus", equals: "01" },
  },
  {
    key: "hasDesignee",
    section: "situation",
    type: "yesno",
    helpKey: "designeeHelp",
  },
  {
    key: "designeeFamilyName",
    section: "situation",
    type: "text",
    maxLength: 80,
    showWhen: { key: "hasDesignee", equals: "Y" },
    forms: ["imm5475"],
  },
  {
    key: "designeeGivenName",
    section: "situation",
    type: "text",
    maxLength: 80,
    showWhen: { key: "hasDesignee", equals: "Y" },
    forms: ["imm5475"],
  },
  {
    key: "designeeRelationship",
    section: "situation",
    type: "text",
    maxLength: 80,
    showWhen: { key: "hasDesignee", equals: "Y" },
    forms: ["imm5475"],
  },
  {
    key: "isCommonLaw",
    section: "situation",
    type: "yesno",
    helpKey: "commonLawHelp",
  },
  {
    key: "partnerFamilyName",
    section: "situation",
    type: "text",
    maxLength: 80,
    showWhen: { key: "isCommonLaw", equals: "Y" },
    forms: ["imm5409"],
  },
  {
    key: "partnerGivenName",
    section: "situation",
    type: "text",
    maxLength: 80,
    showWhen: { key: "isCommonLaw", equals: "Y" },
    forms: ["imm5409"],
  },
  {
    key: "yearsTogether",
    section: "situation",
    type: "text",
    maxLength: 10,
    showWhen: { key: "isCommonLaw", equals: "Y" },
    forms: ["imm5409"],
  },
  {
    key: "needsCustodian",
    section: "situation",
    type: "yesno",
    helpKey: "custodianHelp",
    forms: ["imm5646", "imm1294"],
  },
  {
    key: "schoolName",
    section: "study",
    type: "text",
    maxLength: 120,
    forms: ["imm1294"],
  },
  {
    key: "schoolAddress",
    section: "study",
    type: "textarea",
    maxLength: 200,
    forms: ["imm1294"],
  },
  {
    key: "applicationLocation",
    section: "work",
    type: "select",
    options: [
      { value: "outside", labelKey: "locationOutside" },
      { value: "inside", labelKey: "locationInside" },
    ],
    forms: ["imm1295", "imm5710"],
    helpKey: "applicationLocationHelp",
  },
  {
    key: "employerName",
    section: "work",
    type: "text",
    maxLength: 120,
    forms: ["imm1295", "imm5710"],
  },
  {
    key: "jobTitle",
    section: "work",
    type: "text",
    maxLength: 80,
    forms: ["imm1295", "imm5710"],
  },
  {
    key: "jobDescription",
    section: "work",
    type: "textarea",
    maxLength: 400,
    forms: ["imm1295", "imm5710"],
  },
  // Representative block comes from Organization settings (IMM 5476), not the client questionnaire.
];

export function fieldsForFormCodes(formCodes: string[]): CanonicalField[] {
  const set = new Set(formCodes.map((c) => c.toLowerCase()));
  return CANONICAL_FIELDS.filter((field) => {
    if (!field.forms || field.forms.length === 0) return true;
    return field.forms.some((f) => set.has(f));
  });
}

export function sectionsForFields(fields: CanonicalField[]): QuestionnaireSection[] {
  const present = new Set(fields.map((f) => f.section));
  return QUESTIONNAIRE_SECTIONS.filter((s) => present.has(s));
}

export function isFieldVisible(
  field: CanonicalField,
  answers: Record<string, unknown>,
): boolean {
  if (!field.showWhen) return true;
  return String(answers[field.showWhen.key] ?? "") === field.showWhen.equals;
}

/** Split ISO date into year/month/day for PDF fillers. */
export function expandDobAnswers(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const dob = String(answers.dob || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return answers;
  return {
    ...answers,
    dobYear: m[1],
    dobMonth: m[2],
    dobDay: m[3],
    hasRepresentative: true,
  };
}
