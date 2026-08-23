import type { ParticipantRole, ProgramFamily } from "@/db/schema";

import { formScope, type FormCode } from "./catalog";

export type ApplicationLocation = "outside" | "inside";

export type KitSeedForm = {
  formCode: FormCode;
  isRequired: boolean;
  sortOrder: number;
  /** When set, only matching participant roles receive this person-scoped form. */
  roles?: ParticipantRole[];
};

export type ExpandedKitSeedForm = KitSeedForm & {
  /** Null for project-scoped forms. */
  personId: string | null;
};

export type KitSeedOptions = {
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
};

export const PERMIT_KIT_FAMILIES = [
  "study_permit",
  "work_permit",
  "visitor",
] as const;

export const PR_KIT_FAMILIES = [
  "express_entry",
  "pnp",
  "family_sponsorship",
] as const;

export type PermitKitFamily = (typeof PERMIT_KIT_FAMILIES)[number];
export type PrKitFamily = (typeof PR_KIT_FAMILIES)[number];

export type PersonKitAssignment = {
  personId: string;
  programFamily: PermitKitFamily;
  applicationLocation?: ApplicationLocation;
  needsCustodian?: boolean;
};

export function isPermitKitFamily(
  value: unknown,
): value is PermitKitFamily {
  return (
    value === "study_permit" ||
    value === "work_permit" ||
    value === "visitor"
  );
}

export function isCustomProgram(
  programFamily: ProgramFamily | string,
  organizationProgramId?: string | null,
): boolean {
  return programFamily === "other" && !organizationProgramId;
}

export function isWorkPermitProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return programFamily === "work_permit" || programFamily === "pgwp";
}

export function isStudyPermitProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return programFamily === "study_permit";
}

export function isVisitorProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return programFamily === "visitor";
}

export function isFederalPermitProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return (
    isWorkPermitProgram(programFamily) ||
    isStudyPermitProgram(programFamily) ||
    isVisitorProgram(programFamily)
  );
}

export function isPrProgramFamily(
  programFamily: ProgramFamily | string,
): boolean {
  return (
    programFamily === "express_entry" ||
    programFamily === "pnp" ||
    programFamily === "family_sponsorship"
  );
}

export function isCitizenshipProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return programFamily === "citizenship";
}

export function isIrccKitProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return (
    isFederalPermitProgram(programFamily) ||
    programFamily === "pgwp" ||
    isPrProgramFamily(programFamily) ||
    isCitizenshipProgram(programFamily)
  );
}

export function defaultApplicationLocation(
  programFamily: ProgramFamily | string,
): ApplicationLocation {
  return programFamily === "pgwp" ? "inside" : "outside";
}

export function resolveApplicationLocation(
  value: unknown,
  programFamily: ProgramFamily | string,
): ApplicationLocation {
  return value === "inside" || value === "outside"
    ? value
    : defaultApplicationLocation(programFamily);
}

/** Infer in/out Canada from forms already on the file. */
export function inferApplicationLocationFromForms(
  formCodes: string[],
): ApplicationLocation | undefined {
  const codes = new Set(formCodes.map((c) => c.toLowerCase()));
  if (
    codes.has("imm5710") ||
    codes.has("imm5709") ||
    codes.has("imm5708") ||
    codes.has("imm5556")
  ) {
    return "inside";
  }
  if (
    codes.has("imm0008") ||
    codes.has("imm5669") ||
    codes.has("imm1344") ||
    codes.has("cit0002") ||
    codes.has("imm1295") ||
    codes.has("imm1294") ||
    codes.has("imm5257") ||
    codes.has("imm5257sch1") ||
    codes.has("imm5488") ||
    codes.has("imm5483") ||
    codes.has("imm5645") ||
    codes.has("imm5406")
  ) {
    return "outside";
  }
  return undefined;
}

function ynFlag(value: unknown): boolean {
  const flag = String(value ?? "").trim().toUpperCase();
  return flag === "Y" || flag === "YES" || flag === "TRUE" || flag === "1";
}

/** Common-law partner → IMM 5409. */
export function detectCommonLaw(input: {
  isCommonLaw?: unknown;
  maritalStatus?: unknown;
  participantRoles?: string[];
}): boolean {
  if (ynFlag(input.isCommonLaw)) return true;
  if (String(input.maritalStatus ?? "").trim() === "03") return true;
  return (input.participantRoles ?? []).includes("partner");
}

export function ageFromDob(input: {
  dob?: unknown;
  dobYear?: unknown;
  dobMonth?: unknown;
  dobDay?: unknown;
}): number | undefined {
  let year = Number(String(input.dobYear ?? "").trim());
  let month = Number(String(input.dobMonth ?? "").trim());
  let day = Number(String(input.dobDay ?? "").trim());
  const iso = String(input.dob ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  if (!year || year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

/** Underage student → IMM 5646. IRCC custodianship is typical under 17; we treat under 18 as underage. */
export function detectMinor(input: {
  needsCustodian?: unknown;
  dob?: unknown;
  dobYear?: unknown;
  dobMonth?: unknown;
  dobDay?: unknown;
}): boolean {
  if (ynFlag(input.needsCustodian)) return true;
  const age = ageFromDob(input);
  return age !== undefined && age < 18;
}

/**
 * Federal work permit kit:
 * - inside Canada: IMM 5710, IMM 5707, IMM 5476
 * - outside Canada: IMM 1295, IMM 5645, IMM 5476
 * - common-law partner: + IMM 5409
 * - IMM 5476 always
 */
export function workPermitKitForms(options?: KitSeedOptions): KitSeedForm[] {
  const inside = options?.applicationLocation === "inside";
  const seeds: KitSeedForm[] = [
    {
      formCode: inside ? "imm5710" : "imm1295",
      isRequired: true,
      sortOrder: 10,
    },
    {
      formCode: inside ? "imm5707" : "imm5645",
      isRequired: true,
      sortOrder: 20,
    },
    {
      formCode: "imm5476",
      isRequired: true,
      sortOrder: 90,
    },
  ];
  if (options?.isCommonLaw) {
    seeds.push({ formCode: "imm5409", isRequired: true, sortOrder: 80 });
  }
  return seeds;
}

/**
 * Federal study permit kit:
 * - inside Canada: IMM 5709, IMM 5707, IMM 5476
 * - outside Canada: IMM 1294, IMM 5645, IMM 5476
 * - underage / custodian: + IMM 5646
 * - common-law partner: + IMM 5409
 * - IMM 5476 always
 */
export function studyPermitKitForms(options?: KitSeedOptions): KitSeedForm[] {
  const inside = options?.applicationLocation === "inside";
  const seeds: KitSeedForm[] = [
    {
      formCode: inside ? "imm5709" : "imm1294",
      isRequired: true,
      sortOrder: 10,
    },
    {
      formCode: inside ? "imm5707" : "imm5645",
      isRequired: true,
      sortOrder: 20,
    },
    {
      formCode: "imm5476",
      isRequired: true,
      sortOrder: 90,
    },
  ];
  if (options?.isCommonLaw) {
    seeds.push({ formCode: "imm5409", isRequired: true, sortOrder: 80 });
  }
  if (options?.needsCustodian) {
    seeds.push({ formCode: "imm5646", isRequired: true, sortOrder: 70 });
  }
  return seeds;
}

/**
 * Federal visitor kit:
 * - inside Canada: IMM 5708, IMM 5707, IMM 5476
 * - outside Canada: IMM 5257, IMM 5257 SCH1, IMM 5406, IMM 5476
 * - spouse / common-law: + IMM 5409
 * - IMM 5476 always
 */
export function visitorKitForms(options?: KitSeedOptions): KitSeedForm[] {
  const inside = options?.applicationLocation === "inside";
  const seeds: KitSeedForm[] = inside
    ? [
        { formCode: "imm5708", isRequired: true, sortOrder: 10 },
        { formCode: "imm5707", isRequired: true, sortOrder: 20 },
        { formCode: "imm5476", isRequired: true, sortOrder: 90 },
      ]
    : [
        { formCode: "imm5257", isRequired: true, sortOrder: 10 },
        { formCode: "imm5257sch1", isRequired: true, sortOrder: 15 },
        { formCode: "imm5406", isRequired: true, sortOrder: 20 },
        { formCode: "imm5476", isRequired: true, sortOrder: 90 },
      ];
  if (options?.isCommonLaw) {
    seeds.push({ formCode: "imm5409", isRequired: true, sortOrder: 80 });
  }
  return seeds;
}

const SPONSORED_ROLES: ParticipantRole[] = [
  "principal",
  "spouse",
  "partner",
  "dependent",
  "accompanying",
];

/**
 * Express Entry / PNP / PR kit:
 * IMM 0008, IMM 5669, IMM 5406, IMM 5476; optional IMM 5562 when travel history applies.
 */
export function permanentResidenceKitForms(options?: {
  includeTravelSupplement?: boolean;
}): KitSeedForm[] {
  const seeds: KitSeedForm[] = [
    { formCode: "imm0008", isRequired: true, sortOrder: 10 },
    { formCode: "imm5669", isRequired: true, sortOrder: 20 },
    { formCode: "imm5406", isRequired: true, sortOrder: 30 },
    { formCode: "imm5476", isRequired: true, sortOrder: 90 },
  ];
  if (options?.includeTravelSupplement) {
    seeds.push({ formCode: "imm5562", isRequired: false, sortOrder: 25 });
  }
  return seeds;
}

/**
 * Family sponsorship kit:
 * Sponsor: IMM 1344. Principal and dependents: IMM 0008, IMM 5669, IMM 5406. IMM 5476 always.
 */
export function familySponsorshipKitForms(): KitSeedForm[] {
  return [
    {
      formCode: "imm1344",
      isRequired: true,
      sortOrder: 5,
      roles: ["sponsor"],
    },
    {
      formCode: "imm0008",
      isRequired: true,
      sortOrder: 10,
      roles: SPONSORED_ROLES,
    },
    { formCode: "imm5669", isRequired: true, sortOrder: 20 },
    { formCode: "imm5406", isRequired: true, sortOrder: 30 },
    { formCode: "imm5476", isRequired: true, sortOrder: 90 },
  ];
}

/** Canadian citizenship (adult) kit: CIT 0002 + IMM 5476. */
export function citizenshipKitForms(): KitSeedForm[] {
  return [
    { formCode: "cit0002", isRequired: true, sortOrder: 10 },
    { formCode: "imm5476", isRequired: true, sortOrder: 90 },
  ];
}

/**
 * Base IRCC forms seeded when a project is created for a program.
 * IMM 5476 (use of a representative) is always included — the consultant represents the client.
 */
export function seedFormsForProgram(
  programFamily: ProgramFamily,
  options?: KitSeedOptions,
): KitSeedForm[] {
  const alwaysRep: KitSeedForm = {
    formCode: "imm5476",
    isRequired: true,
    sortOrder: 90,
  };

  switch (programFamily) {
    case "study_permit":
      return studyPermitKitForms({
        applicationLocation: resolveApplicationLocation(
          options?.applicationLocation,
          programFamily,
        ),
        isCommonLaw: options?.isCommonLaw,
        needsCustodian: options?.needsCustodian,
      });
    case "work_permit":
    case "pgwp":
      return workPermitKitForms({
        applicationLocation: resolveApplicationLocation(
          options?.applicationLocation,
          programFamily,
        ),
        isCommonLaw: options?.isCommonLaw,
      });
    case "visitor":
      return visitorKitForms({
        applicationLocation: resolveApplicationLocation(
          options?.applicationLocation,
          programFamily,
        ),
        isCommonLaw: options?.isCommonLaw,
      });
    case "express_entry":
    case "pnp":
      return permanentResidenceKitForms();
    case "family_sponsorship":
      return familySponsorshipKitForms();
    case "citizenship":
      return citizenshipKitForms();
    default:
      return [alwaysRep];
  }
}

/**
 * Expand kit seeds: person-scoped forms get one row per participant;
 * project-scoped forms get a single unassigned row.
 * IMM 5646 is one custodianship declaration for the student (principal).
 */
export function expandSeedsForParticipants(
  seeds: KitSeedForm[],
  personIds: string[],
  participantRoles?: Record<string, ParticipantRole>,
): ExpandedKitSeedForm[] {
  const people = personIds.filter(Boolean);
  const out: ExpandedKitSeedForm[] = [];

  for (const seed of seeds) {
    if (seed.formCode === "imm5646") {
      out.push({
        ...seed,
        personId: people[0] ?? null,
        sortOrder: seed.sortOrder * 100,
      });
      continue;
    }
    if (formScope(seed.formCode) === "person") {
      const eligible = seed.roles?.length
        ? people.filter(
            (personId) =>
              participantRoles?.[personId] &&
              seed.roles!.includes(participantRoles[personId]!),
          )
        : people;
      if (eligible.length === 0) {
        if (!seed.roles?.length) {
          out.push({ ...seed, personId: null });
        }
        continue;
      }
      eligible.forEach((personId, index) => {
        out.push({
          ...seed,
          personId,
          sortOrder: seed.sortOrder * 100 + index,
        });
      });
    } else {
      out.push({ ...seed, personId: null });
    }
  }

  return out;
}

/**
 * Custom project: each person gets their own permit kit (program + in/out).
 * IMM 5409 stays a single project-scoped row when the file is common-law.
 */
export function expandMixedPersonKits(
  kits: PersonKitAssignment[],
  options?: { isCommonLaw?: boolean },
): ExpandedKitSeedForm[] {
  const out: ExpandedKitSeedForm[] = [];
  const seenProject = new Set<FormCode>();

  kits.forEach((kit, index) => {
    const family: ProgramFamily = isPermitKitFamily(kit.programFamily)
      ? kit.programFamily
      : "work_permit";
    const seeds = seedFormsForProgram(family, {
      applicationLocation: kit.applicationLocation,
      isCommonLaw: false,
      needsCustodian: kit.needsCustodian,
    });
    for (const seed of seeds) {
      if (seed.formCode === "imm5409") continue;
      if (formScope(seed.formCode) === "project") {
        if (seenProject.has(seed.formCode)) continue;
        seenProject.add(seed.formCode);
        out.push({
          ...seed,
          personId: null,
          sortOrder: seed.sortOrder * 100,
        });
        continue;
      }
      out.push({
        ...seed,
        personId: kit.personId,
        sortOrder: (index + 1) * 1000 + seed.sortOrder,
      });
    }
  });

  if (options?.isCommonLaw && !seenProject.has("imm5409")) {
    out.push({
      formCode: "imm5409",
      isRequired: true,
      sortOrder: 8000,
      personId: null,
    });
  }

  return out;
}

/** Optional companions a consultant can add via "Add form". */
export const ADDABLE_COMPANION_FORMS: FormCode[] = [
  "imm5475",
  "imm5409",
  "imm5646",
  "imm5645",
  "imm5406",
  "imm5707",
  "imm1294",
  "imm1295",
  "imm5257",
  "imm5257sch1",
  "imm5708",
  "imm5709",
  "imm5710",
  "imm5483",
  "imm0008",
  "imm5669",
  "imm1344",
  "imm5562",
  "cit0002",
];

/**
 * Forms the ask-once questionnaire + fillers can drive (excludes checklists).
 * Always offered in Add form after the program-prioritized list.
 */
export const FILLABLE_QUESTIONNAIRE_FORMS: FormCode[] = [
  "imm1294",
  "imm1295",
  "imm5709",
  "imm5710",
  "imm5257",
  "imm5257sch1",
  "imm5708",
  "imm5707",
  "imm5645",
  "imm5406",
  "imm5476",
  "imm5475",
  "imm5409",
  "imm5646",
  "imm0008",
  "imm5669",
  "imm1344",
  "imm5562",
  "cit0002",
];

/** PR / citizenship add list (prioritized). */
export const PR_ADDABLE_FORMS: FormCode[] = [
  "imm0008",
  "imm5669",
  "imm5406",
  "imm1344",
  "imm5562",
  "imm5476",
  "imm5475",
  "imm5409",
];

export const CITIZENSHIP_ADDABLE_FORMS: FormCode[] = [
  "cit0002",
  "imm5476",
  "imm5475",
];

/** Work-permit add list: no checklists or unrelated permit forms. */
export const WORK_PERMIT_ADDABLE_FORMS: FormCode[] = [
  "imm5409",
  "imm5475",
  "imm5645",
  "imm5707",
  "imm5562",
];

/** Study-permit add list: no checklists or primary swap. */
export const STUDY_PERMIT_ADDABLE_FORMS: FormCode[] = [
  "imm5409",
  "imm5475",
  "imm5646",
  "imm5645",
  "imm5707",
  "imm5562",
];

/** Visitor add list: no primary / schedule swap. */
export const VISITOR_ADDABLE_FORMS: FormCode[] = [
  "imm5409",
  "imm5475",
  "imm5406",
  "imm5707",
  "imm5257sch1",
  "imm5562",
];

function withFillableForms(prioritized: FormCode[]): FormCode[] {
  const seen = new Set(prioritized);
  return [
    ...prioritized,
    ...FILLABLE_QUESTIONNAIRE_FORMS.filter((code) => !seen.has(code)),
  ];
}

export function addableFormsForProgram(
  programFamily: ProgramFamily | string,
): FormCode[] {
  if (isWorkPermitProgram(programFamily)) {
    return withFillableForms(WORK_PERMIT_ADDABLE_FORMS);
  }
  if (isStudyPermitProgram(programFamily)) {
    return withFillableForms(STUDY_PERMIT_ADDABLE_FORMS);
  }
  if (isVisitorProgram(programFamily)) {
    return withFillableForms(VISITOR_ADDABLE_FORMS);
  }
  if (isPrProgramFamily(programFamily)) {
    return withFillableForms(PR_ADDABLE_FORMS);
  }
  if (isCitizenshipProgram(programFamily)) {
    return withFillableForms(CITIZENSHIP_ADDABLE_FORMS);
  }
  if (isCustomProgram(programFamily)) {
    return withFillableForms([
      ...new Set([
        ...WORK_PERMIT_ADDABLE_FORMS,
        ...STUDY_PERMIT_ADDABLE_FORMS,
        ...VISITOR_ADDABLE_FORMS,
        ...PR_ADDABLE_FORMS,
        ...CITIZENSHIP_ADDABLE_FORMS,
      ]),
    ]);
  }
  return withFillableForms(ADDABLE_COMPANION_FORMS);
}

export function applicationLabelForForms(
  formCodes: string[],
  lang: "e" | "f" = "e",
): string {
  const fr = lang === "f";
  if (formCodes.includes("imm1294") || formCodes.includes("imm5709")) {
    return fr ? "Permis d'études" : "Study permit";
  }
  if (formCodes.includes("imm1295") || formCodes.includes("imm5710")) {
    return fr ? "Permis de travail" : "Work permit";
  }
  if (formCodes.includes("imm5257") || formCodes.includes("imm5708")) {
    return fr ? "Visa de visiteur" : "Visitor visa";
  }
  if (formCodes.includes("imm0008") || formCodes.includes("imm1344")) {
    return fr ? "Demande de résidence permanente" : "Permanent residence";
  }
  if (formCodes.includes("cit0002")) {
    return fr ? "Demande de citoyenneté" : "Citizenship application";
  }
  return fr ? "Demande d'immigration" : "Immigration application";
}

export function occupationLabelForForms(
  formCodes: string[],
  lang: "e" | "f" = "e",
): string {
  const fr = lang === "f";
  if (formCodes.includes("imm1294") || formCodes.includes("imm5709")) {
    return fr ? "Étudiant" : "Student";
  }
  if (formCodes.includes("imm5257") || formCodes.includes("imm5708")) {
    return fr ? "Visiteur" : "Visitor";
  }
  return fr ? "Travailleur" : "Worker";
}
