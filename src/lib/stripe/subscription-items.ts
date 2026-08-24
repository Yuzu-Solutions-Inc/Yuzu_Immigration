import type { BillingInterval } from "@/lib/billing/plans";

export function lookupKeyIsTeam(key: string): boolean {
  return key.startsWith("team_");
}

export function catalogItemsNeedReplaceAll(
  currentInterval: BillingInterval | null,
  targetInterval: BillingInterval,
  lookupKeys: readonly string[],
): boolean {
  if (currentInterval && currentInterval !== targetInterval) return true;
  return lookupKeys.some(lookupKeyIsTeam);
}

export function subscriptionAutomaticTaxParams(subscription: {
  automatic_tax?: { enabled?: boolean | null } | null;
}): { automatic_tax: { enabled: true } } | Record<string, never> {
  return subscription.automatic_tax?.enabled
    ? { automatic_tax: { enabled: true } }
    : {};
}

export function isAutomaticTaxSetupError(error: unknown): boolean {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  return /automatic tax|head office address|tax registration/i.test(message);
}

export function compactCatalogItem<T extends { id?: string }>(
  item: T,
): T | Omit<T, "id"> {
  if (item.id) return item;
  const { id: _id, ...rest } = item;
  return rest;
}
