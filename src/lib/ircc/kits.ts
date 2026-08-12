import type { ProgramFamily } from "@/db/schema";

import { formScope, type FormCode } from "./catalog";

export type ApplicationLocation = "outside" | "inside";

export type KitSeedForm = {
  formCode: FormCode;
  isRequired: boolean;
  sortOrder: number;
};

export type ExpandedKitSeedForm = KitSeedForm & {
  /** Null for project-scoped forms. */
  personId: string | null;
};

export type KitSeedOptions = {
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
};

export function isWorkPermitProgram(
  programFamily: ProgramFamily | string,
): boolean {
  return programFamily === "work_permit" || programFamily === "pgwp";
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
  if (codes.has("imm5710") || codes.has("imm5556")) return "inside";
  if (codes.has("imm1295") || codes.has("imm5488") || codes.has("imm5406")) {
    return "outside";
  }
  return undefined;
}

/** Common-law partner → IMM 5409. */
export function detectCommonLaw(input: {
  isCommonLaw?: unknown;
  maritalStatus?: unknown;
  participantRoles?: string[];
}): boolean {
  const flag = String(input.isCommonLaw ?? "").trim().toUpperCase();
  if (flag === "Y" || flag === "YES" || flag === "TRUE" || flag === "1") {
    return true;
  }
  if (String(input.maritalStatus ?? "").trim() === "03") return true;
  return (input.participantRoles ?? []).includes("partner");
}

/**
 * Federal work permit kit:
 * - inside Canada: IMM 5710, IMM 5707, IMM 5476
 * - outside Canada: IMM 1295, IMM 5406, IMM 5476
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
      formCode: inside ? "imm5707" : "imm5406",
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
      return [
        { formCode: "imm1294", isRequired: true, sortOrder: 10 },
        { formCode: "imm5707", isRequired: true, sortOrder: 20 },
        { formCode: "imm5483", isRequired: true, sortOrder: 30 },
        alwaysRep,
      ];
    case "work_permit":
    case "pgwp":
      return workPermitKitForms({
        applicationLocation: resolveApplicationLocation(
          options?.applicationLocation,
          programFamily,
        ),
        isCommonLaw: options?.isCommonLaw,
      });
    default:
      return [alwaysRep];
  }
}

/**
 * Expand kit seeds: person-scoped forms get one row per participant;
 * project-scoped forms get a single unassigned row.
 */
export function expandSeedsForParticipants(
  seeds: KitSeedForm[],
  personIds: string[],
): ExpandedKitSeedForm[] {
  const people = personIds.filter(Boolean);
  const out: ExpandedKitSeedForm[] = [];

  for (const seed of seeds) {
    if (formScope(seed.formCode) === "person") {
      if (people.length === 0) {
        out.push({ ...seed, personId: null });
        continue;
      }
      people.forEach((personId, index) => {
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

/** Optional companions a consultant can add via "Add form". */
export const ADDABLE_COMPANION_FORMS: FormCode[] = [
  "imm5475",
  "imm5409",
  "imm5646",
  "imm5406",
  "imm5707",
  "imm1294",
  "imm1295",
  "imm5710",
  "imm5483",
];

/** Work-permit add list: no checklists or unrelated permit forms. */
export const WORK_PERMIT_ADDABLE_FORMS: FormCode[] = [
  "imm5409",
  "imm5475",
  "imm5406",
  "imm5707",
];

export function addableFormsForProgram(
  programFamily: ProgramFamily | string,
): FormCode[] {
  if (isWorkPermitProgram(programFamily)) {
    return WORK_PERMIT_ADDABLE_FORMS;
  }
  if (programFamily === "study_permit") {
    return ["imm5475", "imm5409", "imm5646", "imm5707", "imm5483"];
  }
  return ADDABLE_COMPANION_FORMS;
}

export function applicationLabelForForms(formCodes: string[]): string {
  if (formCodes.includes("imm1294")) return "Study permit";
  if (formCodes.includes("imm1295") || formCodes.includes("imm5710")) {
    return "Work permit";
  }
  return "Immigration application";
}
