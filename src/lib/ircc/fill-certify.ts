/**
 * Fill each IRCC form from questionnaire fixtures, then assert Acrobat
 * constraints and DocMDP certification. Flags PDF cells the app does not fill.
 */
import { existsSync, readFileSync } from "node:fs";
import { ALL_FORM_CODES, type FormCode } from "./catalog";
import {
  cwaToIsoFromXml,
  localIsoToday,
  lmoXmlLooksEmptyString,
  pdfHasDocMdp,
} from "./acrobat-constraints";
import { CHECKLIST_FORM_CODES } from "./fields";
import { answersForForm, fillCasesForForm, type FillCaseId } from "./fill-fixtures";
import { unfilledLeaves } from "./fill-coverage";
import { fillProjectForms } from "./fill-project";
import formMeta from "./form-meta.json";
import { extractDatasetsXml, type FormMeta } from "./xfa-incremental";

export type FormFillCaseResult = {
  ok: boolean;
  error?: string;
};

export type FormFillReport = {
  code: string;
  blankCertified: boolean | null;
  fillCertified: boolean | null;
  cases: Partial<Record<FillCaseId, FormFillCaseResult>>;
  unfilled: string[];
  errors: string[];
  warnings: string[];
};

export type FillCertificationResult = {
  reports: FormFillReport[];
  errors: string[];
  warnings: string[];
  passed: boolean;
};

function blankPath(key: string): string {
  return `assets/ircc/blanks/${key}.pdf`;
}

function loadBlank(key: string): Uint8Array | null {
  const file = blankPath(key);
  if (!existsSync(file)) return null;
  return new Uint8Array(readFileSync(file));
}

function identityPresent(xml: string, family: string, given: string): boolean {
  return xml.includes(family) || xml.includes(given) || xml.includes(`${family}, ${given}`);
}

async function fillOne(
  code: string,
  answers: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const result = await fillProjectForms({
    instances: [{ code, answers, projectFormCodes: [code] }],
    preview: true,
  });
  const form = result.forms[0];
  if (!form) {
    throw new Error(result.warnings[0] || "no filled PDF");
  }
  return { bytes: form.bytes, warnings: result.warnings };
}

export async function runFillCertification(opts?: {
  codes?: FormCode[];
  lang?: "e" | "f";
}): Promise<FillCertificationResult> {
  process.env.IRCC_BLANKS_LOCAL = "1";
  const lang = opts?.lang ?? "e";
  const codes = opts?.codes ?? ALL_FORM_CODES;
  const reports: FormFillReport[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const today = localIsoToday();

  for (const code of codes) {
    const report: FormFillReport = {
      code,
      blankCertified: null,
      fillCertified: null,
      cases: {},
      unfilled: [],
      errors: [],
      warnings: [],
    };
    const key = `${code}${lang}`;
    const meta = (formMeta as Record<string, FormMeta | undefined>)[key];
    const blank = loadBlank(key);

    if (!meta) {
      report.warnings.push(`${key}: missing form-meta — cannot certify fill`);
      reports.push(report);
      warnings.push(...report.warnings);
      continue;
    }
    if (!blank) {
      report.warnings.push(`${key}: no local blank — cannot certify fill`);
      reports.push(report);
      warnings.push(...report.warnings);
      continue;
    }
    if (meta.datasetsObj == null) {
      report.blankCertified = pdfHasDocMdp(blank);
      report.fillCertified = false;
      reports.push(report);
      continue;
    }

    report.blankCertified = pdfHasDocMdp(blank);

    const cases = fillCasesForForm(code);
    for (const density of cases) {
      try {
        const answers = answersForForm(code, density, lang);
        const family = String(answers.familyName || "");
        const given = String(answers.givenName || "");
        const { bytes, warnings: fillWarnings } = await fillOne(code, answers);
        for (const warning of fillWarnings) {
          report.warnings.push(`${density}: ${warning}`);
        }
        if (report.blankCertified) {
          const still = pdfHasDocMdp(bytes);
          report.fillCertified = still;
          if (!still) {
            const message = `${key}/${density}: DocMDP certification missing after fill`;
            report.errors.push(message);
            report.cases[density] = { ok: false, error: message };
            continue;
          }
        } else {
          report.fillCertified = false;
        }

        const xml = await extractDatasetsXml(bytes, meta);
        if ((code === "imm1295" || code === "imm5710") && lmoXmlLooksEmptyString(xml)) {
          const message = `${key}/${density}: empty LMIA written as empty string`;
          report.errors.push(message);
          report.cases[density] = { ok: false, error: message };
          continue;
        }
        const cwaTo = cwaToIsoFromXml(xml);
        if ((code === "imm1294" || code === "imm1295") && cwaTo && cwaTo <= today) {
          const message = `${key}/${density}: CWA ToDate ${cwaTo} is not after today`;
          report.errors.push(message);
          report.cases[density] = { ok: false, error: message };
          continue;
        }
        if (
          family &&
          given &&
          !CHECKLIST_FORM_CODES.has(code) &&
          !identityPresent(xml, family, given)
        ) {
          const message = `${key}/${density}: filled PDF missing applicant name`;
          report.errors.push(message);
          report.cases[density] = { ok: false, error: message };
          continue;
        }
        report.cases[density] = { ok: true };
        if (density === "full") {
          report.unfilled = unfilledLeaves(xml);
        }
      } catch (error) {
        const message = `${key}/${density}: ${error instanceof Error ? error.message : String(error)}`;
        report.errors.push(message);
        report.cases[density] = { ok: false, error: message };
      }
    }

    reports.push(report);
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }

  return { reports, errors, warnings, passed: errors.length === 0 };
}

export function printFillCertification(result: FillCertificationResult) {
  console.log("\n=== Fill, certify, coverage ===");
  for (const report of result.reports) {
    const cases = Object.entries(report.cases)
      .map(([id, row]) => `${id}:${row.ok ? "ok" : "FAIL"}`)
      .join(" ");
    const cert =
      report.blankCertified == null
        ? "no-blank"
        : report.blankCertified
          ? report.fillCertified
            ? "certified"
            : "cert-lost"
          : "uncertified-blank";
    const line = `${report.code} ${cert}${cases ? ` ${cases}` : ""}`;
    if (report.errors.length) {
      console.error(`FAIL  ${line}`);
      for (const message of report.errors) console.error(`      ${message}`);
    } else console.log(`OK    ${line}`);
    for (const warning of report.warnings) console.log(`FLAG  ${warning}`);
    if (report.unfilled.length) {
      const preview = report.unfilled.slice(0, 8).join(", ");
      const more =
        report.unfilled.length > 8 ? ` (+${report.unfilled.length - 8} more)` : "";
      console.log(`NOTE  ${report.code} unfilled: ${preview}${more}`);
    }
  }
}
