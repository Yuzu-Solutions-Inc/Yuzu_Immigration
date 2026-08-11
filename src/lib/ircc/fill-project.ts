import JSZip from "jszip";

import formMeta from "./form-meta.json";
import { loadBlankPdf } from "./blanks";
import { expandDobAnswers } from "./fields";
import { applicationLabelForForms } from "./kits";
import {
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
import { validateAnswers } from "./fillers/imm1294-validate";
import { fillImm1295Pdf } from "./fillers/imm1295";
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
): CompanionAnswers & {
  email: string;
  formLanguage: "e" | "f";
  forms: string[];
  schoolName?: string;
  schoolAddress?: string;
  needsCustodian?: boolean;
  applicationLocation?: "outside" | "inside";
  employerName?: string;
  jobDescription?: string;
} {
  const expanded = expandDobAnswers(raw);
  const yn = (key: string) =>
    String(expanded[key] || "").toUpperCase() === "Y";

  return {
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
    parent2FamilyName: String(expanded.parent2FamilyName || ""),
    parent2GivenName: String(expanded.parent2GivenName || ""),
    spouseFamilyName: String(expanded.spouseFamilyName || ""),
    spouseGivenName: String(expanded.spouseGivenName || ""),
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
    schoolName: String(expanded.schoolName || ""),
    schoolAddress: String(expanded.schoolAddress || ""),
    needsCustodian: yn("needsCustodian"),
    applicationLocation:
      String(expanded.applicationLocation || "outside") === "inside"
        ? "inside"
        : "outside",
    employerName: String(expanded.employerName || ""),
    jobTitle: String(expanded.jobTitle || ""),
    jobDescription: String(expanded.jobDescription || ""),
  };
}

async function fillCompanion(
  code: string,
  lang: "e" | "f",
  answers: ReturnType<typeof toCompanionAnswers>,
): Promise<Uint8Array> {
  const blank = await loadBlankPdf(code, lang);
  const meta = metaFor(code, lang);
  const appLabel = applicationLabelForForms(answers.forms);

  const patchers: Record<string, (xml: string) => string> = {
    imm5707: (xml) =>
      patchImm5707(xml, answers, {
        defaultOccupation: answers.forms.includes("imm1294")
          ? "Student"
          : "Worker",
      }),
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

function buildPrimaryPayload(
  answers: ReturnType<typeof toCompanionAnswers>,
): Record<string, unknown> {
  return {
    ...answers,
    email: answers.email,
    serviceIn: answers.formLanguage === "f" ? "French" : "English",
    preferredLang: answers.formLanguage === "f" ? "French" : "English",
    ableToCommunicate: answers.formLanguage === "f" ? "French" : "English",
    nativeLang: answers.citizenship || "English",
    status: "01",
    sameAsMailing: "Y",
    phoneType: "Cellular",
    funds: "Myself",
    studyLevel: "05",
    fieldOfStudy: "0001",
    schoolProvince: answers.provinceState || "ON",
    schoolCity: answers.city || "Toronto",
    schoolAddress: answers.schoolAddress || answers.schoolName || "TBD",
    schoolName: answers.schoolName || "TBD",
    dli: "O000000000000",
    studyFromYear: String(new Date().getFullYear()),
    studyFromMonth: "09",
    studyFromDay: "01",
    studyToYear: String(new Date().getFullYear() + 2),
    studyToMonth: "04",
    studyToDay: "30",
    tuitionAmount: "0",
    availableFunds: "0",
    passportNumber: "TBD",
    passportCountry: answers.citizenship || "Unknown",
    passportIssueYear: "2020",
    passportIssueMonth: "01",
    passportIssueDay: "01",
    passportExpiryYear: "2030",
    passportExpiryMonth: "01",
    passportExpiryDay: "01",
    previousCor: "N",
    educationIndicator: "N",
    bgTb: "N",
    bgDisorder: "N",
    bgOverstay: "N",
    bgRefused: "N",
    bgCriminal: "N",
    bgMilitary: "N",
    occupation: answers.occupation || answers.jobTitle || "Student",
    employer: answers.employerName || answers.schoolName || "N/A",
    hasAlias: "N",
    hasNatId: "N",
    hasUsCard: "N",
    langTest: "N",
  };
}

export async function fillProjectForms(input: {
  formCodes?: string[];
  answers?: Record<string, unknown>;
  /** Preferred: one entry per project_forms row with person-specific answers. */
  instances?: FillFormInstance[];
}): Promise<FillResult> {
  const instances: FillFormInstance[] =
    input.instances ??
    (input.formCodes ?? []).map((code) => ({
      code,
      answers: input.answers ?? {},
      projectFormCodes: input.formCodes,
    }));

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

    if (!answers.familyName || !answers.givenName) {
      warnings.push(
        `${code}${label ? ` (${label})` : ""}: enter family name and given name.`,
      );
      continue;
    }
    if (!answers.dobYear || !answers.dobMonth || !answers.dobDay) {
      warnings.push(
        `${code} (${answers.familyName}): enter date of birth before generating.`,
      );
      continue;
    }

    try {
      let bytes: Uint8Array;
      if (code === "imm1294") {
        const payload = buildPrimaryPayload(answers);
        const validated = validateAnswers(payload);
        if (!validated.ok) {
          warnings.push(`IMM 1294 skipped: ${validated.error}`);
          continue;
        }
        const blank = await loadBlankPdf(code, lang);
        bytes = await fillImm1294Pdf(blank, validated.answers as Imm1294Answers);
      } else if (code === "imm1295") {
        const payload = buildPrimaryPayload(answers);
        const blank = await loadBlankPdf(code, lang);
        bytes = await fillImm1295Pdf(blank, payload as never);
      } else if (code === "imm5710") {
        const payload = buildPrimaryPayload(answers);
        const blank = await loadBlankPdf(code, lang);
        bytes = await fillImm5710Pdf(blank, payload as never);
      } else {
        bytes = await fillCompanion(code, lang, answers);
      }

      let filename = `${code}${lang}_${answers.familyName}_${answers.givenName}.pdf`
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
      warnings.push(
        `${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
