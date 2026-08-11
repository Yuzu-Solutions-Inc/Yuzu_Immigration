import type { PersonImmigrationStatus } from "@/db/schema";

export const PERSON_IMMIGRATION_STATUSES = [
  "none",
  "visitor",
  "student",
  "worker",
  "maintained",
  "permanent_resident",
  "canadian_citizen",
  "refugee_claimant",
  "protected_person",
  "overstay",
  "other",
] as const satisfies readonly PersonImmigrationStatus[];

export function personStatusAllowsExpiry(status: PersonImmigrationStatus) {
  return status !== "none";
}
