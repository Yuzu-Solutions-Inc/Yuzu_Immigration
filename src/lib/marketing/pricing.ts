import type { AppLocale } from "@/lib/i18n/locales";

/** Public list and founding prices. Amounts are CAD, exclusive of GST/HST. */
export const PRICING = {
  currency: "CAD",
  foundingCohortSize: 100,
  /** Customer-facing Stripe promotion code auto-applied for founding firms. */
  foundingPromoCode: "FOUNDING",
  promoMonths: 12,
  priceChangeNoticeDays: 30,
  trialDays: 30,
  annualMonthsPaid: 10,
  annualFreeMonths: 2,
  extraSeatMonthly: 39,
  extraSeatFoundingMonthly: 29,
  standard: {
    foundingMonthly: 59,
    listMonthly: 79,
    includedUsers: 1,
  },
} as const;

/** Stored on the org row. Legacy `team` subscriptions are billed as Standard seats. */
export type PricingPlanId = "standard" | "team";

export function extraSeatMonthlyCad(founding: boolean): number {
  return founding
    ? PRICING.extraSeatFoundingMonthly
    : PRICING.extraSeatMonthly;
}

/** CAD dollars taken off list price for founding first-seat $59. */
export function foundingAmountOffCad(
  plan: PricingPlanId,
  interval: "month" | "year",
): number {
  const monthlyOff =
    PRICING.standard.listMonthly - PRICING.standard.foundingMonthly;
  if (plan === "team") return 0;
  return interval === "year" ? annualTotal(monthlyOff) : monthlyOff;
}

export function formatCadAmount(amount: number, locale: AppLocale): string {
  if (locale === "fr") return `${amount}\u00a0$`;
  return `$${amount}`;
}

export function cadMonthlyPeriod(locale: AppLocale): string {
  if (locale === "fr") return "/mois";
  if (locale === "es") return "/mes";
  return "/mo";
}

export function formatCadMonthly(amount: number, locale: AppLocale): string {
  return `${formatCadAmount(amount, locale)}${cadMonthlyPeriod(locale)}`;
}

/** Yearly total: 10 months paid, 2 months free. */
export function annualTotal(monthly: number): number {
  return monthly * PRICING.annualMonthsPaid;
}

export function formatCadYearly(amount: number, locale: AppLocale): string {
  if (locale === "fr") return `${amount}\u00a0$/an`;
  if (locale === "es") return `$${amount}/año`;
  return `$${amount}/yr`;
}
