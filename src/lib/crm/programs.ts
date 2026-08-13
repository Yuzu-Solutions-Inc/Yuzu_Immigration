import type {
  ParticipantRole,
  ProgramFamily,
  ProjectJurisdiction,
} from "@/db/schema";

export const PROGRAM_FAMILIES: ProgramFamily[] = [
  "study_permit",
  "work_permit",
  "visitor",
  "pgwp",
  "express_entry",
  "pnp",
  "family_sponsorship",
  "humanitarian",
  "quebec_pstq",
  "quebec_family",
  "quebec_temporary",
  "other",
];

export function isQuebecOnlyProgram(
  program: ProgramFamily | string,
): boolean {
  return (
    program === "quebec_pstq" ||
    program === "quebec_family" ||
    program === "quebec_temporary"
  );
}

/** Single-kit IRCC programs offered on create/edit. */
export const PERMIT_PROGRAM_FAMILIES: ProgramFamily[] = [
  "study_permit",
  "work_permit",
  "visitor",
];

/** Create/edit options: the three permits plus a mixed custom file. */
export const SELECTABLE_PROGRAM_FAMILIES: ProgramFamily[] = [
  ...PERMIT_PROGRAM_FAMILIES,
  "other",
];

export function isPermitProgramFamily(
  program: ProgramFamily | string,
): boolean {
  return (PERMIT_PROGRAM_FAMILIES as string[]).includes(program);
}

/** Mixed file: each participant can have a different permit + applying-from. */
export function isCustomProgram(
  program: ProgramFamily | string,
): boolean {
  return program === "other";
}

export type ProjectComposition = "individual" | "couple" | "family";

export function defaultJurisdictionForProgram(
  _program?: ProgramFamily | string,
): ProjectJurisdiction {
  return "federal";
}

const PARTICIPANT_ROLE_RANK: Record<ParticipantRole, number> = {
  principal: 0,
  spouse: 1,
  partner: 2,
  dependent: 3,
  sponsor: 4,
  accompanying: 5,
};

export function compareParticipantRole(a: string, b: string): number {
  const left = PARTICIPANT_ROLE_RANK[a as ParticipantRole] ?? 50;
  const right = PARTICIPANT_ROLE_RANK[b as ParticipantRole] ?? 50;
  return left - right;
}

export function sortByPrincipalFirst<T extends { role: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareParticipantRole(a.role, b.role));
}

export function defaultRolesForComposition(
  composition: ProjectComposition,
): ParticipantRole[] {
  switch (composition) {
    case "couple":
      return ["principal", "spouse"];
    case "family":
      return ["principal", "spouse", "dependent"];
    default:
      return ["principal"];
  }
}

export function inferCompositionFromRoles(
  roles: ParticipantRole[],
): ProjectComposition {
  const hasDependent = roles.some((role) => role === "dependent");
  const hasPartner = roles.some(
    (role) => role === "spouse" || role === "partner",
  );
  if (hasDependent || roles.length > 2) return "family";
  if (hasPartner || roles.length === 2) return "couple";
  return "individual";
}

export function buildProjectTitle(input: {
  programFamily: ProgramFamily;
  programLabel: string;
  peopleNames: string[];
}): string {
  const names = input.peopleNames.filter(Boolean);
  if (names.length === 0) {
    return input.programLabel;
  }
  if (names.length === 1) {
    return `${input.programLabel} — ${names[0]}`;
  }
  if (names.length === 2) {
    return `${input.programLabel} — ${names[0]} & ${names[1]}`;
  }
  return `${input.programLabel} — ${names[0]} +${names.length - 1}`;
}
