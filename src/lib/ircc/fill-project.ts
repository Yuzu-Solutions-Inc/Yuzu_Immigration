import JSZip from "jszip";

import formMeta from "./form-meta.json";
import { loadBlankPdf } from "./blanks";
import { expandAnswersForFill } from "./expand-answers";
import { applicationLabelForForms, occupationLabelForForms } from "./kits";
import {
  patchImm5645,
  patchImm5406,
  patchImm5409,
  patchImm5475,
  patchImm5476,
  patchImm5707,
  type CompanionAnswers,
} from "./patch-companions";
import {
  patchImm5483,
  patchImm5646,
  type KitAnswers as StudyKitAnswers,
} from "./study-patchers";
import {
  patchImm5488,
  patchImm5556,
  type KitAnswers as WorkKitAnswers,
} from "./work-patchers";
import { fillXfaDatasetsIncremental, type FormMeta } from "./xfa-incremental";
import { fillImm1294Pdf, type Imm1294Answers } from "./fillers/imm1294";
import {
  coerceAnswersForPreview,
  validateAnswers,
} from "./fillers/imm1294-validate";
import { fillImm1295Pdf } from "./fillers/imm1295";
import { fillImm5257Pdf } from "./fillers/imm5257";
import { fillImm5257Sch1Pdf } from "./fillers/imm5257sch1";
import { fillImm5708Pdf } from "./fillers/imm5708";
import { fillImm5709Pdf } from "./fillers/imm5709";
import { fillImm5710Pdf } from "./fillers/imm5710";

export type FilledForm = {
  code: string;
  formId?: string;
  personId?: string | null;
  filename: string;
  bytes: Uint8Array;
};

export type FillFormInstance = {
  id?: string;
  code: string;
  personId?: string | null;
  answers: Record<string, unknown>;
  /** All form codes on the project (for checklist / companion context). */
  projectFormCodes?: string[];
};

export type FillResult = {
  forms: FilledForm[];
  warnings: string[];
};

function asLang(raw: unknown): "e" | "f" {
  return String(raw || "e").toLowerCase().startsWith("f") ? "f" : "e";
}

function metaFor(code: string, lang: "e" | "f"): FormMeta {
  const key = `${code}${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  return meta;
}

function toCompanionAnswers(
  raw: Record<string, unknown>,
  formCodes: string[],
): CompanionAnswers & Record<string, unknown> & {
  email: string;
  formLanguage: "e" | "f";
  forms: string[];
} {
  const expanded = expandAnswersForFill(raw);
  const yn = (key: string) =>
    String(expanded[key] || "").toUpperCase() === "Y";

  return {
    ...expanded,
    email: String(expanded.email || ""),
    formLanguage: asLang(expanded.formLanguage),
    forms: formCodes,
    familyName: String(expanded.familyName || ""),
    givenName: String(expanded.givenName || ""),
    sex: String(expanded.sex || "Unknown"),
    dobYear: String(expanded.dobYear || ""),
    dobMonth: String(expanded.dobMonth || ""),
    dobDay: String(expanded.dobDay || ""),
    citizenship: String(expanded.citizenship || ""),
    placeBirthCountry: String(expanded.placeBirthCountry || ""),
    placeBirthCity: String(expanded.placeBirthCity || ""),
    maritalStatus: String(expanded.maritalStatus || "02"),
    occupation: String(expanded.occupation || expanded.jobTitle || ""),
    emailContact: String(expanded.email || ""),
    phone: String(expanded.phone || ""),
    phoneCountryCode: String(expanded.phoneCountryCode || ""),
    streetNum: String(expanded.streetNum || ""),
    streetName: String(expanded.streetName || ""),
    city: String(expanded.city || ""),
    provinceState: String(expanded.provinceState || ""),
    country: String(expanded.country || ""),
    postalCode: String(expanded.postalCode || ""),
    parent1FamilyName: String(expanded.parent1FamilyName || ""),
    parent1GivenName: String(expanded.parent1GivenName || ""),
    parent1Dob: String(expanded.parent1Dob || ""),
    parent1Cob: String(expanded.parent1Cob || ""),
    parent1Address: String(expanded.parent1Address || ""),
    parent1MaritalStatus: String(expanded.parent1MaritalStatus || ""),
    parent1Occupation: String(expanded.parent1Occupation || ""),
    parent1Telephone: String(expanded.parent1Telephone || ""),
    parent2FamilyName: String(expanded.parent2FamilyName || ""),
    parent2GivenName: String(expanded.parent2GivenName || ""),
    parent2Dob: String(expanded.parent2Dob || ""),
    parent2Cob: String(expanded.parent2Cob || ""),
    parent2Address: String(expanded.parent2Address || ""),
    parent2MaritalStatus: String(expanded.parent2MaritalStatus || ""),
    parent2Occupation: String(expanded.parent2Occupation || ""),
    parent2Telephone: String(expanded.parent2Telephone || ""),
    spouseFamilyName: String(expanded.spouseFamilyName || ""),
    spouseGivenName: String(expanded.spouseGivenName || ""),
    spouseDob: String(expanded.spouseDob || ""),
    spouseCob: String(expanded.spouseCob || ""),
    spouseAddress: String(expanded.spouseAddress || ""),
    spouseOccupation: String(expanded.spouseOccupation || ""),
    spouseAccompanying: Boolean(expanded.spouseAccompanying),
    hasRepresentative: true,
    repFamilyName: String(expanded.repFamilyName || ""),
    repGivenName: String(expanded.repGivenName || ""),
    repOrganization: String(expanded.repOrganization || ""),
    repEmail: String(expanded.repEmail || ""),
    repPhone: String(expanded.repPhone || ""),
    repPhoneCountryCode: String(expanded.repPhoneCountryCode || ""),
    repMembershipId: String(expanded.repMembershipId || ""),
    repStreetNum: String(expanded.repStreetNum || ""),
    repStreetName: String(expanded.repStreetName || ""),
    repCity: String(expanded.repCity || ""),
    repProvince: String(expanded.repProvince || ""),
    repCountry: String(expanded.repCountry || ""),
    repPostalCode: String(expanded.repPostalCode || ""),
    hasDesignee: yn("hasDesignee"),
    designeeFamilyName: String(expanded.designeeFamilyName || ""),
    designeeGivenName: String(expanded.designeeGivenName || ""),
    designeeRelationship: String(expanded.designeeRelationship || ""),
    isCommonLaw: yn("isCommonLaw"),
    partnerFamilyName: String(expanded.partnerFamilyName || ""),
    partnerGivenName: String(expanded.partnerGivenName || ""),
    yearsTogether: String(expanded.yearsTogether || ""),
    commonLawCity: String(expanded.commonLawCity || ""),
    commonLawProvince: String(expanded.commonLawProvince || ""),
    commonLawCountry: String(expanded.commonLawCountry || ""),
    commonLawStart: String(expanded.commonLawStart || ""),
    schoolName: String(expanded.schoolName || ""),
    schoolAddress: String(expanded.schoolAddress || ""),
    needsCustodian: yn("needsCustodian"),
    custodianFamilyName: String(expanded.custodianFamilyName || ""),
    custodianGivenName: String(expanded.custodianGivenName || ""),
    custodianDob: String(expanded.custodianDob || ""),
    custodianStatus: String(expanded.custodianStatus || ""),
    custodianAddress: String(expanded.custodianAddress || ""),
    custodianTelephone: String(expanded.custodianTelephone || ""),
    applicationLocation:
      String(expanded.applicationLocation || "outside") === "inside"
        ? "inside"
        : "outside",
    employerName: String(expanded.employerName || ""),
    jobTitle: String(expanded.jobTitle || ""),
    jobDescription: String(expanded.jobDescription || ""),
    children: Array.isArray(expanded.children) ? expanded.children : [],
    siblings: Array.isArray(expanded.siblings) ? expanded.siblings : [],
  };
}

async function fillCompanion(
  code: string,
  lang: "e" | "f",
  answers: ReturnType<typeof toCompanionAnswers>,
): Promise<Uint8Array> {
  const blank = await loadBlankPdf(code, lang);
  const meta = metaFor(code, lang);
  const appLabel = applicationLabelForForms(answers.forms, lang);

  const patchers: Record<string, (xml: string) => string> = {
    imm5707: (xml) =>
      patchImm5707(xml, answers, {
        defaultOccupation: occupationLabelForForms(answers.forms, lang),
      }),
    imm5645: (xml) => patchImm5645(xml, answers),
    imm5406: (xml) => patchImm5406(xml, answers),
    imm5476: (xml) => patchImm5476(xml, answers, { applicationLabel: appLabel }),
    imm5475: (xml) => patchImm5475(xml, answers),
    imm5409: (xml) => patchImm5409(xml, answers),
    imm5646: (xml) =>
      patchImm5646(xml, answers as StudyKitAnswers),
    imm5483: (xml) =>
      patchImm5483(xml, answers as StudyKitAnswers),
    imm5488: (xml) =>
      patchImm5488(xml, answers as WorkKitAnswers),
    imm5556: (xml) =>
      patchImm5556(xml, answers as WorkKitAnswers),
  };

  const patch = patchers[code];
  if (!patch) throw new Error(`No companion patcher for ${code}`);
  return fillXfaDatasetsIncremental(blank, meta, patch);
}

/** Prefer questionnaire values; only fall back when a required key is blank. */
function buildPrimaryPayload(
  answers: ReturnType<typeof toCompanionAnswers>,
): Record<string, unknown> {
  const lang = answers.formLanguage === "f" ? "French" : "English";
  const fallbacks: Record<string, unknown> = {
    serviceIn: lang,
    preferredLang: lang,
    ableToCommunicate: lang,
    nativeLang: "001",
    sameAsMailing: "Y",
    phoneType: "02",
    funds: "Myself",
    previousCor: "N",
    educationIndicator: "N",
    bgTb: "N",
    bgDisorder: "N",
    bgOverstay: "N",
    bgRefused: "N",
    bgCrime: "N",
    bgMilitary: "N",
    bgViolence: "N",
    bgWitness: "N",
    cicContactConsent: "Y",
    hasAlias: "N",
    hasNatId: "N",
    hasUsCard: "N",
    langTest: "N",
    previouslyMarried: "N",
    sameAsCor: "Y",
    jobs: [],
  };

  const merged: Record<string, unknown> = { ...fallbacks, ...answers };
  for (const [key, value] of Object.entries(fallbacks)) {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
      merged[key] = value;
    }
  }

  if (!merged.occupation && answers.jobTitle) {
    merged.occupation = answers.jobTitle;
  }
  if (!merged.employer && answers.employerName) {
    merged.employer = answers.employerName;
  }
  if (!merged.passportCountry && answers.citizenship) {
    merged.passportCountry = answers.citizenship;
  }
  if (!merged.currentCountry && answers.country) {
    merged.currentCountry = answers.country;
  }
  if (!Array.isArray(merged.jobs)) merged.jobs = [];

  return merged;
}

/** Replace nullish leaves so incomplete previews fill instead of throwing. */
function blanksForPreview(value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(blanksForPreview);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = blanksForPreview(nested);
    }
    return out;
  }
  return value;
}

export async function fillProjectForms(input: {
  formCodes?: string[];
  answers?: Record<string, unknown>;
  /** Preferred: one entry per project_forms row with person-specific answers. */
  instances?: FillFormInstance[];
  /** Fill whatever answers exist; skip filing-quality gates and fall back to the blank PDF. */
  preview?: boolean;
}): Promise<FillResult> {
  const instances: FillFormInstance[] =
    input.instances ??
    (input.formCodes ?? []).map((code) => ({
      code,
      answers: input.answers ?? {},
      projectFormCodes: input.formCodes,
    }));

  const preview = Boolean(input.preview);
  const warnings: string[] = [];
  const out: FilledForm[] = [];
  const usedNames = new Set<string>();

  for (const instance of instances) {
    const code = instance.code.toLowerCase();
    const projectCodes = (
      instance.projectFormCodes ?? instances.map((i) => i.code)
    ).map((c) => c.toLowerCase());
    const answers = toCompanionAnswers(instance.answers, projectCodes);
    const lang = answers.formLanguage;
    const label = `${answers.familyName || "form"} ${answers.givenName || ""}`.trim();

    if (!preview && (!answers.familyName || !answers.givenName)) {
      warnings.push(
        `${code}${label ? ` (${label})` : ""}: enter family name and given name.`,
      );
      continue;
    }
    if (!preview && (!answers.dobYear || !answers.dobMonth || !answers.dobDay)) {
      warnings.push(
        `${code} (${answers.familyName}): enter date of birth before generating.`,
      );
      continue;
    }

    try {
      let bytes: Uint8Array;
      const payload = (
        preview
          ? blanksForPreview(buildPrimaryPayload(answers))
          : buildPrimaryPayload(answers)
      ) as Record<string, unknown>;
      const companion = (
        preview ? blanksForPreview(answers) : answers
      ) as typeof answers;
      const blank = code.startsWith("imm")
        ? await loadBlankPdf(code, lang)
        : new Uint8Array();
      if (code === "imm1294") {
        const validated = validateAnswers(payload);
        const meta = metaFor(code, lang);
        const crypto = {
          fileKeyHex: meta.fileKeyHex,
          datasetsObj: meta.datasetsObj,
          datasetsGen: meta.datasetsGen,
        };
        if (validated.ok) {
          bytes = await fillImm1294Pdf(
            blank,
            validated.answers as Imm1294Answers,
            crypto,
          );
        } else if (preview) {
          warnings.push(`IMM 1294 preview is incomplete: ${validated.error}`);
          bytes = await fillImm1294Pdf(
            blank,
            coerceAnswersForPreview(payload),
            crypto,
          );
        } else {
          warnings.push(`IMM 1294 skipped: ${validated.error}`);
          continue;
        }
      } else if (code === "imm1295") {
        bytes = await fillImm1295Pdf(blank, payload as never, lang);
      } else if (code === "imm5709") {
        bytes = await fillImm5709Pdf(blank, payload as never, lang);
      } else if (code === "imm5710") {
        bytes = await fillImm5710Pdf(blank, payload as never, lang);
      } else if (code === "imm5257") {
        bytes = await fillImm5257Pdf(blank, payload as never, lang);
      } else if (code === "imm5708") {
        bytes = await fillImm5708Pdf(blank, payload as never, lang);
      } else if (code === "imm5257sch1") {
        bytes = await fillImm5257Sch1Pdf(blank, payload as never, lang);
      } else {
        bytes = await fillCompanion(code, lang, companion);
      }

      const who = [answers.familyName, answers.givenName]
        .filter(Boolean)
        .join("_");
      let filename = (who ? `${code}${lang}_${who}.pdf` : `${code}${lang}.pdf`)
        .replace(/[^\w.\-]+/g, "_");
      if (usedNames.has(filename)) {
        const suffix = (instance.personId ?? instance.id ?? out.length)
          .toString()
          .slice(0, 8);
        filename = filename.replace(/\.pdf$/, `_${suffix}.pdf`);
      }
      usedNames.add(filename);

      out.push({
        code,
        formId: instance.id,
        personId: instance.personId,
        filename,
        bytes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (preview) {
        try {
          const blank = await loadBlankPdf(code, lang);
          const filename = `${code}${lang}.pdf`.replace(/[^\w.\-]+/g, "_");
          warnings.push(`${code}: showing blank form (${message})`);
          out.push({
            code,
            formId: instance.id,
            personId: instance.personId,
            filename: usedNames.has(filename)
              ? filename.replace(/\.pdf$/, `_${out.length}.pdf`)
              : filename,
            bytes: blank,
          });
          usedNames.add(filename);
          continue;
        } catch {
          // fall through to the regular warning
        }
      }
      warnings.push(`${code}: ${message}`);
    }
  }

  if (out.length === 0) {
    throw new Error(
      warnings[0] || "Could not generate any forms. Complete the questionnaire.",
    );
  }

  return { forms: out, warnings };
}

export async function zipFilledForms(forms: FilledForm[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const form of forms) {
    zip.file(form.filename, form.bytes);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
