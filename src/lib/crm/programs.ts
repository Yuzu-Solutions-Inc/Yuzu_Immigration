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

/** IRCC PDF kits only — Quebec/MIFI programs use Arrima / their own portal. */
export const SELECTABLE_PROGRAM_FAMILIES: ProgramFamily[] =
  PROGRAM_FAMILIES.filter((family) => !isQuebecOnlyProgram(family));

export type ProjectComposition = "individual" | "couple" | "family";

export function defaultJurisdictionForProgram(
  _program?: ProgramFamily | string,
): ProjectJurisdiction {
  return "federal";
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
