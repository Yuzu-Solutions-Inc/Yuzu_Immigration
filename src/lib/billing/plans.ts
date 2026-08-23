import { PRICING, type PricingPlanId } from "@/lib/marketing/pricing";

export type BillingInterval = "month" | "year";

export function includedSeats(plan: PricingPlanId): number {
  return plan === "team"
    ? PRICING.team.includedUsers
    : PRICING.standard.includedUsers;
}

export function extraSeatsNeeded(
  plan: PricingPlanId,
  memberCount: number,
): number {
  return Math.max(0, memberCount - includedSeats(plan));
}

export function totalPaidSeats(
  plan: PricingPlanId,
  extraSeats: number,
): number {
  return includedSeats(plan) + Math.max(0, extraSeats);
}

export function planMonthlyCad(
  plan: PricingPlanId,
  founding: boolean,
): number {
  if (plan === "team") {
    return founding ? PRICING.team.foundingMonthly : PRICING.team.listMonthly;
  }
  return founding
    ? PRICING.standard.foundingMonthly
    : PRICING.standard.listMonthly;
}
