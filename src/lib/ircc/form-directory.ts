import {
  ALL_FORM_CODES,
  formTitle,
  IRCC_FORMS,
  type FormCode,
} from "./catalog";
import type { PermitKitFamily } from "./kits";
import revisions from "./form-revisions.json";
import statusJson from "./form-validation-status.json";

export const FORM_CATEGORIES = [
  "primary",
  "family",
  "schedules",
  "representative",
  "supporting",
  "checklists",
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number];

export type FormValidationFile = {
  checkedAt: string;
  passed: boolean;
  datesOnly?: boolean;
  errorCount: number;
  warningCount: number;
  errors?: string[];
  warnings?: string[];
  forms: Record<
    string,
    {
      liveUpdated: string | null;
      passed: boolean;
      errors: string[];
      warnings: string[];
    }
  >;
};

export type FormVersionRow = {
  code: FormCode;
  category: FormCategory;
  visaFamilies: PermitKitFamily[];
  /** IRCC edition the app fills (YYYY-MM). */
  published: string | null;
  /** Month listed on canada.ca at last check. */
  livePublished: string | null;
  lastCheckedAt: string | null;
  validation: "passed" | "failed" | "pending";
  errors: string[];
};

const CATEGORY_BY_FORM: Record<FormCode, FormCategory> = {
  imm1294: "primary",
  imm1295: "primary",
  imm5709: "primary",
  imm5710: "primary",
  imm5257: "primary",
  imm5708: "primary",
  imm5257sch1: "schedules",
  imm5707: "family",
  imm5645: "family",
  imm5406: "family",
  imm5476: "representative",
  imm5475: "representative",
  imm5409: "supporting",
  imm5646: "supporting",
  imm5483: "checklists",
  imm5488: "checklists",
  imm5556: "checklists",
};

const VISA_BY_FORM: Record<FormCode, PermitKitFamily[]> = {
  imm1294: ["study_permit"],
  imm5709: ["study_permit"],
  imm5483: ["study_permit"],
  imm5646: ["study_permit"],
  imm1295: ["work_permit"],
  imm5710: ["work_permit"],
  imm5488: ["work_permit"],
  imm5556: ["work_permit"],
  imm5257: ["visitor"],
  imm5257sch1: ["visitor"],
  imm5406: ["visitor"],
  imm5708: ["visitor"],
  imm5645: ["study_permit", "work_permit"],
  imm5707: ["study_permit", "work_permit", "visitor"],
  imm5476: ["study_permit", "work_permit", "visitor"],
  imm5475: ["study_permit", "work_permit", "visitor"],
  imm5409: ["study_permit", "work_permit", "visitor"],
};

export function formatImmCode(code: string): string {
  const rest = code.replace(/^imm/i, "").toUpperCase();
  if (rest.endsWith("SCH1")) {
    return `IMM ${rest.slice(0, -4)} SCH1`;
  }
  return `IMM ${rest}`;
}

export function formDisplayTitle(
  code: FormCode,
  locale: "en" | "fr" | "es",
): string {
  return formTitle(code, locale);
}

export function loadFormValidationStatus(): FormValidationFile | null {
  const data = statusJson as FormValidationFile;
  if (!data?.checkedAt) return null;
  return data;
}

export function getFormVersionRows(): FormVersionRow[] {
  const status = loadFormValidationStatus();
  const pins = revisions.forms as Record<string, { irccUpdated: string }>;

  return ALL_FORM_CODES.filter((code) => code in IRCC_FORMS).map((code) => {
    const published = pins[code]?.irccUpdated ?? null;
    const check = status?.forms[code];
    let validation: FormVersionRow["validation"] = "pending";
    if (check) validation = check.passed ? "passed" : "failed";
    else if (status && published) {
      validation = status.passed ? "passed" : "pending";
    }
    return {
      code,
      category: CATEGORY_BY_FORM[code],
      visaFamilies: VISA_BY_FORM[code],
      published,
      livePublished: check?.liveUpdated ?? published,
      lastCheckedAt: status?.checkedAt ?? null,
      validation,
      errors: check?.errors ?? [],
    };
  });
}

export function groupedFormVersionRows(): Array<{
  category: FormCategory;
  forms: FormVersionRow[];
}> {
  const rows = getFormVersionRows();
  return FORM_CATEGORIES.map((category) => ({
    category,
    forms: rows.filter((row) => row.category === category),
  })).filter((group) => group.forms.length > 0);
}
