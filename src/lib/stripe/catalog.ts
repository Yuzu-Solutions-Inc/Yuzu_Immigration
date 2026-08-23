import "server-only";

import { annualTotal, PRICING } from "@/lib/marketing/pricing";
import { getStripe } from "@/lib/stripe/client";
import type { BillingInterval } from "@/lib/billing/plans";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import type Stripe from "stripe";

export type PriceLookupKey =
  | "standard_founding_monthly"
  | "standard_founding_yearly"
  | "standard_list_monthly"
  | "standard_list_yearly"
  | "team_founding_monthly"
  | "team_founding_yearly"
  | "team_list_monthly"
  | "team_list_yearly"
  | "extra_seat_monthly"
  | "extra_seat_yearly";

const LOOKUP_KEYS: PriceLookupKey[] = [
  "standard_founding_monthly",
  "standard_founding_yearly",
  "standard_list_monthly",
  "standard_list_yearly",
  "team_founding_monthly",
  "team_founding_yearly",
  "team_list_monthly",
  "team_list_yearly",
  "extra_seat_monthly",
  "extra_seat_yearly",
];

function cadCents(dollars: number): number {
  return dollars * 100;
}

function specFor(key: PriceLookupKey): {
  productKey: "standard" | "team" | "extra_seat";
  unitAmount: number;
  interval: BillingInterval;
} {
  const extraMonthly = PRICING.extraSeatMonthly;
  const map: Record<
    PriceLookupKey,
    { productKey: "standard" | "team" | "extra_seat"; unitAmount: number; interval: BillingInterval }
  > = {
    standard_founding_monthly: {
      productKey: "standard",
      unitAmount: cadCents(PRICING.standard.foundingMonthly),
      interval: "month",
    },
    standard_founding_yearly: {
      productKey: "standard",
      unitAmount: cadCents(annualTotal(PRICING.standard.foundingMonthly)),
      interval: "year",
    },
    standard_list_monthly: {
      productKey: "standard",
      unitAmount: cadCents(PRICING.standard.listMonthly),
      interval: "month",
    },
    standard_list_yearly: {
      productKey: "standard",
      unitAmount: cadCents(annualTotal(PRICING.standard.listMonthly)),
      interval: "year",
    },
    team_founding_monthly: {
      productKey: "team",
      unitAmount: cadCents(PRICING.team.foundingMonthly),
      interval: "month",
    },
    team_founding_yearly: {
      productKey: "team",
      unitAmount: cadCents(annualTotal(PRICING.team.foundingMonthly)),
      interval: "year",
    },
    team_list_monthly: {
      productKey: "team",
      unitAmount: cadCents(PRICING.team.listMonthly),
      interval: "month",
    },
    team_list_yearly: {
      productKey: "team",
      unitAmount: cadCents(annualTotal(PRICING.team.listMonthly)),
      interval: "year",
    },
    extra_seat_monthly: {
      productKey: "extra_seat",
      unitAmount: cadCents(extraMonthly),
      interval: "month",
    },
    extra_seat_yearly: {
      productKey: "extra_seat",
      unitAmount: cadCents(annualTotal(extraMonthly)),
      interval: "year",
    },
  };
  return map[key];
}

const PRODUCT_NAMES = {
  standard: "Permit OS Standard",
  team: "Permit OS Team",
  extra_seat: "Permit OS extra staff seat",
} as const;

export function planPriceLookupKey(
  plan: PricingPlanId,
  interval: BillingInterval,
  founding: boolean,
): PriceLookupKey {
  const rate = founding ? "founding" : "list";
  const period = interval === "year" ? "yearly" : "monthly";
  return `${plan}_${rate}_${period}` as PriceLookupKey;
}

export function extraSeatLookupKey(interval: BillingInterval): PriceLookupKey {
  return interval === "year" ? "extra_seat_yearly" : "extra_seat_monthly";
}

export function parseLookupKey(key: string | null | undefined): {
  plan: PricingPlanId | "extra_seat";
  interval: BillingInterval;
  founding: boolean;
} | null {
  if (!key) return null;
  if (key === "extra_seat_monthly") {
    return { plan: "extra_seat", interval: "month", founding: false };
  }
  if (key === "extra_seat_yearly") {
    return { plan: "extra_seat", interval: "year", founding: false };
  }
  const match = key.match(/^(standard|team)_(founding|list)_(monthly|yearly)$/);
  if (!match) return null;
  return {
    plan: match[1] as PricingPlanId,
    founding: match[2] === "founding",
    interval: match[3] === "yearly" ? "year" : "month",
  };
}

async function ensureProduct(
  stripe: Stripe,
  key: "standard" | "team" | "extra_seat",
): Promise<string> {
  const product = await stripe.products.create(
    {
      name: PRODUCT_NAMES[key],
      metadata: { plan: key },
    },
    { idempotencyKey: `permitos_product_${key}_v1` },
  );
  return product.id;
}

export async function ensureBillingPrices(): Promise<
  Record<PriceLookupKey, string>
> {
  const stripe = getStripe();
  const listed = await stripe.prices.list({
    lookup_keys: LOOKUP_KEYS,
    limit: 10,
    active: true,
  });
  const byKey = new Map<string, string>();
  for (const price of listed.data) {
    if (price.lookup_key) byKey.set(price.lookup_key, price.id);
  }

  const missing = LOOKUP_KEYS.filter((key) => !byKey.has(key));
  if (missing.length === 0) {
    return Object.fromEntries(
      LOOKUP_KEYS.map((key) => [key, byKey.get(key)!]),
    ) as Record<PriceLookupKey, string>;
  }

  const productIds = {
    standard: await ensureProduct(stripe, "standard"),
    team: await ensureProduct(stripe, "team"),
    extra_seat: await ensureProduct(stripe, "extra_seat"),
  };

  for (const key of missing) {
    const spec = specFor(key);
    const price = await stripe.prices.create(
      {
        currency: "cad",
        product: productIds[spec.productKey],
        unit_amount: spec.unitAmount,
        recurring: { interval: spec.interval },
        lookup_key: key,
        transfer_lookup_key: true,
        tax_behavior: "exclusive",
        metadata: { lookup: key },
      },
      { idempotencyKey: `permitos_price_${key}_v1` },
    );
    byKey.set(key, price.id);
  }

  return Object.fromEntries(
    LOOKUP_KEYS.map((key) => [key, byKey.get(key)!]),
  ) as Record<PriceLookupKey, string>;
}
