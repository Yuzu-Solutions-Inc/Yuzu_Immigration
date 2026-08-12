export type FormCode =
  | "imm1294"
  | "imm1295"
  | "imm5709"
  | "imm5710"
  | "imm5707"
  | "imm5645"
  | "imm5483"
  | "imm5488"
  | "imm5556"
  | "imm5476"
  | "imm5475"
  | "imm5409"
  | "imm5646";

/**
 * person — one IRCC form per applicant / participant
 * project — one form for the whole file (package checklist, couple declaration)
 */
export type FormScope = "person" | "project";

export type IrccFormDefinition = {
  code: FormCode;
  titleEn: string;
  titleFr: string;
  scope: FormScope;
  /** Always seeded for matching kits when true */
  core?: boolean;
};

export const IRCC_FORMS: Record<FormCode, IrccFormDefinition> = {
  imm1294: {
    code: "imm1294",
    titleEn: "Study permit application (outside Canada)",
    titleFr: "Demande de permis d’études (hors Canada)",
    scope: "person",
    core: true,
  },
  imm1295: {
    code: "imm1295",
    titleEn: "Work permit application (outside Canada)",
    titleFr: "Demande de permis de travail (hors Canada)",
    scope: "person",
    core: true,
  },
  imm5709: {
    code: "imm5709",
    titleEn: "Study permit — change / extend / remain (in Canada)",
    titleFr: "Permis d’études — modifier / prolonger / demeurer (au Canada)",
    scope: "person",
    core: true,
  },
  imm5710: {
    code: "imm5710",
    titleEn: "Work permit — change / extend / remain (in Canada)",
    titleFr: "Permis de travail — modifier / prolonger / demeurer (au Canada)",
    scope: "person",
    core: true,
  },
  imm5707: {
    code: "imm5707",
    titleEn: "Family information (in Canada)",
    titleFr: "Renseignements familiaux (au Canada)",
    scope: "person",
    core: true,
  },
  imm5645: {
    code: "imm5645",
    titleEn: "Family information (outside Canada)",
    titleFr: "Renseignements familiaux (hors Canada)",
    scope: "person",
    core: true,
  },
  imm5483: {
    code: "imm5483",
    titleEn: "Document checklist — study permit",
    titleFr: "Liste de contrôle — permis d’études",
    scope: "project",
  },
  imm5488: {
    code: "imm5488",
    titleEn: "Document checklist — work permit (outside Canada)",
    titleFr: "Liste de contrôle — permis de travail (hors Canada)",
    scope: "project",
    core: true,
  },
  imm5556: {
    code: "imm5556",
    titleEn: "Document checklist — worker (in Canada)",
    titleFr: "Liste de contrôle — travailleur (au Canada)",
    scope: "project",
    core: true,
  },
  imm5476: {
    code: "imm5476",
    titleEn: "Use of a representative",
    titleFr: "Recours à un représentant",
    scope: "person",
    core: true,
  },
  imm5475: {
    code: "imm5475",
    titleEn: "Authority to release personal information",
    titleFr: "Autorisation de communiquer des renseignements personnels",
    scope: "person",
  },
  imm5409: {
    code: "imm5409",
    titleEn: "Common-law union declaration",
    titleFr: "Déclaration d’union de fait",
    scope: "project",
  },
  imm5646: {
    code: "imm5646",
    titleEn: "Custodianship declaration (minors)",
    titleFr: "Déclaration de tutelle (mineurs)",
    scope: "person",
  },
};

export const ALL_FORM_CODES = Object.keys(IRCC_FORMS) as FormCode[];

export function isFormCode(value: string): value is FormCode {
  return value in IRCC_FORMS;
}

export function formScope(code: FormCode | string): FormScope {
  if (isFormCode(code)) return IRCC_FORMS[code].scope;
  return "person";
}

export function isPersonScopedForm(code: FormCode | string): boolean {
  return formScope(code) === "person";
}

export function formTitle(
  code: FormCode,
  locale: "en" | "fr" | "es",
): string {
  const def = IRCC_FORMS[code];
  if (locale === "fr") return def.titleFr;
  return def.titleEn;
}
