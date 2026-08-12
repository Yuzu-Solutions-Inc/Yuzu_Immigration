/** CICC Client File Management: retain closed files ≥ 6 years. */
export const CLOSED_FILE_RETENTION_YEARS = 6;

export function computeRetainUntil(closedAtIso: string | Date): string {
  const closed =
    typeof closedAtIso === "string" ? new Date(closedAtIso) : closedAtIso;
  const retain = new Date(closed);
  retain.setUTCFullYear(retain.getUTCFullYear() + CLOSED_FILE_RETENTION_YEARS);
  return retain.toISOString();
}

export function isEligibleForDestruction(input: {
  closedAt: string | null;
  retainUntil: string | null;
  destroyedAt: string | null;
  now?: Date;
}): boolean {
  if (input.destroyedAt) return false;
  if (!input.closedAt || !input.retainUntil) return false;
  const now = input.now ?? new Date();
  return now.getTime() >= new Date(input.retainUntil).getTime();
}
