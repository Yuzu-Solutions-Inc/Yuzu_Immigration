import type { AppLocale } from "@/lib/i18n/locales";

/** Public list and founding prices. Amounts are CAD, exclusive of GST/HST. */
export const PRICING = {
  currency: "CAD",
  foundingCohortSize: 100,
  promoMonths: 12,
  priceChangeNoticeDays: 30,
  annualMonthsPaid: 10,
  annualFreeMonths: 2,
  starter: {
    listMonthly: 19,
    includedUsers: 1,
    activeProjects: 10,
  },
  standard: {
    foundingMonthly: 49,
    listMonthly: 69,
    includedUsers: 1,
  },
  team: {
    foundingMonthly: 99,
    listMonthly: 129,
    includedUsers: 4,
    extraSeatMonthly: 29,
  },
} as const;

export type PricingPlanId = "starter" | "standard" | "team";

export function formatCadAmount(amount: number, locale: AppLocale): string {
  if (locale === "fr") return `${amount}\u00a0$`;
  return `$${amount}`;
}

export function formatCadMonthly(amount: number, locale: AppLocale): string {
  if (locale === "fr") return `${amount}\u00a0$/mois`;
  if (locale === "es") return `$${amount}/mes`;
  return `$${amount}/mo`;
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
