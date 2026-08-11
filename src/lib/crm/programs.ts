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

export type ProjectComposition = "individual" | "couple" | "family";

export function defaultJurisdictionForProgram(
  program: ProgramFamily,
): ProjectJurisdiction {
  if (
    program === "quebec_pstq" ||
    program === "quebec_family" ||
    program === "quebec_temporary"
  ) {
    return "quebec";
  }
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
