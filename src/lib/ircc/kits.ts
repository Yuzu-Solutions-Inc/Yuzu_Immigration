import type { ProgramFamily } from "@/db/schema";

import type { FormCode } from "./catalog";

export type KitSeedForm = {
  formCode: FormCode;
  isRequired: boolean;
  sortOrder: number;
};

/**
 * Base IRCC forms seeded when a project is created for a program.
 * IMM 5476 (use of a representative) is always included — the consultant represents the client.
 */
export function seedFormsForProgram(
  programFamily: ProgramFamily,
  options?: { applicationLocation?: "outside" | "inside" },
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
    case "pgwp": {
      const inside = options?.applicationLocation === "inside";
      return [
        {
          formCode: inside ? "imm5710" : "imm1295",
          isRequired: true,
          sortOrder: 10,
        },
        { formCode: "imm5707", isRequired: true, sortOrder: 20 },
        {
          formCode: inside ? "imm5556" : "imm5488",
          isRequired: true,
          sortOrder: 30,
        },
        alwaysRep,
      ];
    }
    default:
      // Other programs: start with representative form; consultant adds the rest.
      return [alwaysRep];
  }
}

/** Optional companions a consultant can add via "Add form". */
export const ADDABLE_COMPANION_FORMS: FormCode[] = [
  "imm5475",
  "imm5409",
  "imm5646",
  "imm1294",
  "imm1295",
  "imm5710",
  "imm5707",
  "imm5483",
  "imm5488",
  "imm5556",
];

export function applicationLabelForForms(formCodes: string[]): string {
  if (formCodes.includes("imm1294")) return "Study permit";
  if (
    formCodes.includes("imm1295") ||
    formCodes.includes("imm5710") ||
    formCodes.includes("imm5488") ||
    formCodes.includes("imm5556")
  ) {
    return "Work permit";
  }
  return "Immigration application";
}
