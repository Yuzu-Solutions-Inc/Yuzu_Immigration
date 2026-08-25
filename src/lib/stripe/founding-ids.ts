import type { BillingInterval } from "@/lib/billing/plans";
import { PRICING, type PricingPlanId } from "@/lib/marketing/pricing";

const MONTH_SECS = 30 * 24 * 60 * 60;

export function foundingCouponId(
  plan: PricingPlanId,
  interval: BillingInterval,
  months: number = PRICING.promoMonths,
): string {
  const period = interval === "year" ? "year" : "month";
  return `permitos_founding_${plan}_${period}_${months}m`;
}

/** Whole months left on a repeating founding coupon, or 0 if it has ended. */
export function remainingFoundingPromoMonths(
  endUnix: number | null | undefined,
  nowUnix = Math.floor(Date.now() / 1000),
): number {
  if (!endUnix || endUnix <= nowUnix) return 0;
  return Math.min(
    PRICING.promoMonths,
    Math.max(1, Math.ceil((endUnix - nowUnix) / MONTH_SECS)),
  );
}

export function legacyForeverFoundingCouponId(
  plan: PricingPlanId,
  interval: BillingInterval,
): string {
  const period = interval === "year" ? "year" : "month";
  return `permitos_founding_${plan}_${period}`;
}

export function isFoundingCouponId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith("permitos_founding_"));
}

export function isLegacyForeverFoundingCouponId(
  id: string | null | undefined,
): boolean {
  return Boolean(
    id && /^permitos_founding_(standard|team)_(month|year)$/.test(id),
  );
}
