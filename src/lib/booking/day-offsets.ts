const MAX_OFFSETS = 3;
const MIN_DAY = 0;
const MAX_DAY = 90;

/** Parse up to 3 unique day-offsets (0–90), comma or space separated. */
export function parseDayOffsets(raw: string | undefined): number[] | null {
  if (!raw || !raw.trim()) return [];
  const parts = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > MAX_OFFSETS) return null;
  const days: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (!Number.isFinite(value) || value < MIN_DAY || value > MAX_DAY) {
      return null;
    }
    if (seen.has(value)) continue;
    seen.add(value);
    days.push(value);
  }
  return days.sort((a, b) => b - a);
}

export function normalizeDayOffsets(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is number =>
        typeof item === "number" &&
        Number.isFinite(item) &&
        item >= MIN_DAY &&
        item <= MAX_DAY,
    );
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return parseDayOffsets(String(Math.trunc(value))) ?? [];
  }
  if (typeof value === "string") {
    return parseDayOffsets(value) ?? [];
  }
  return [];
}
