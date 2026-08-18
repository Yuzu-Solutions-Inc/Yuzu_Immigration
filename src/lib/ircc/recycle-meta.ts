import type { FlatAnswers } from "@/lib/ircc/answers-store";

export const RECYCLE_META_KEY = "_recycle";

export type RecycleMeta = {
  importedAt: string;
  projectIds: string[];
  keys: string[];
};

export function isRecycleMeta(value: unknown): value is RecycleMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.importedAt === "string" &&
    Array.isArray(record.projectIds) &&
    Array.isArray(record.keys)
  );
}

export function getRecycleMeta(bag: FlatAnswers | undefined): RecycleMeta | null {
  if (!bag) return null;
  const value = bag[RECYCLE_META_KEY];
  return isRecycleMeta(value) ? value : null;
}
