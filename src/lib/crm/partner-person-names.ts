import type { PersonImmigrationStatus } from "@/db/schema";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";

export function splitDisplayName(
  legalName: string,
  contactName?: string | null,
) {
  const source = (contactName?.trim() || legalName).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Unknown", lastName: "Contact" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function partnerLegalName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

export function asImmigrationStatus(
  value: string | null | undefined,
): PersonImmigrationStatus {
  if (
    value &&
    (PERSON_IMMIGRATION_STATUSES as readonly string[]).includes(value)
  ) {
    return value as PersonImmigrationStatus;
  }
  return "none";
}

export function shouldSyncImmigrationPerson(
  kind: "customer" | "provider" | "both",
) {
  return kind === "customer" || kind === "both";
}
