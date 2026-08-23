import "server-only";

import {
  annualTotal,
  foundingAmountOffCad,
  PRICING,
  type PricingPlanId,
} from "@/lib/marketing/pricing";
import type { BillingInterval } from "@/lib/billing/plans";
import { getStripe } from "@/lib/stripe/client";
import type Stripe from "stripe";

export type PriceLookupKey =
  | "standard_list_monthly"
  | "standard_list_yearly"
  | "team_list_monthly"
  | "team_list_yearly"
  | "extra_seat_monthly"
  | "extra_seat_yearly";

const LOOKUP_KEYS: PriceLookupKey[] = [
  "standard_list_monthly",
  "standard_list_yearly",
  "team_list_monthly",
  "team_list_yearly",
  "extra_seat_monthly",
  "extra_seat_yearly",
];

const LEGACY_FOUNDING_LOOKUP_KEYS = [
  "standard_founding_monthly",
  "standard_founding_yearly",
  "team_founding_monthly",
  "team_founding_yearly",
] as const;

export function foundingCouponId(
  plan: PricingPlanId,
  interval: BillingInterval,
): string {
  const period = interval === "year" ? "year" : "month";
  return `permitos_founding_${plan}_${period}`;
}

export function isFoundingCouponId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith("permitos_founding_"));
}

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
): PriceLookupKey {
  const period = interval === "year" ? "yearly" : "monthly";
  return `${plan}_list_${period}` as PriceLookupKey;
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

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "resource_missing"
  );
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

async function productIdForPrice(
  stripe: Stripe,
  priceId: string,
): Promise<string> {
  const price = await stripe.prices.retrieve(priceId);
  return typeof price.product === "string" ? price.product : price.product.id;
}

async function archiveLegacyFoundingPrices(stripe: Stripe) {
  const listed = await stripe.prices.list({
    lookup_keys: [...LEGACY_FOUNDING_LOOKUP_KEYS],
    limit: 10,
    active: true,
  });
  for (const price of listed.data) {
    if (!price.active) continue;
    await stripe.prices.update(price.id, { active: false });
  }
}

async function setListPricesAsDefault(
  stripe: Stripe,
  byKey: Map<string, string>,
) {
  const standardMonthly = byKey.get("standard_list_monthly");
  const teamMonthly = byKey.get("team_list_monthly");
  if (standardMonthly) {
    const productId = await productIdForPrice(stripe, standardMonthly);
    await stripe.products.update(productId, { default_price: standardMonthly });
  }
  if (teamMonthly) {
    const productId = await productIdForPrice(stripe, teamMonthly);
    await stripe.products.update(productId, { default_price: teamMonthly });
  }
}

export async function ensureFoundingCoupons(
  stripe: Stripe,
  prices: Record<PriceLookupKey, string>,
): Promise<void> {
  const standardProduct = await productIdForPrice(
    stripe,
    prices.standard_list_monthly,
  );
  const teamProduct = await productIdForPrice(stripe, prices.team_list_monthly);

  const specs: Array<{
    plan: PricingPlanId;
    interval: BillingInterval;
    productId: string;
  }> = [
    { plan: "standard", interval: "month", productId: standardProduct },
    { plan: "standard", interval: "year", productId: standardProduct },
    { plan: "team", interval: "month", productId: teamProduct },
    { plan: "team", interval: "year", productId: teamProduct },
  ];

  for (const spec of specs) {
    const id = foundingCouponId(spec.plan, spec.interval);
    try {
      await stripe.coupons.retrieve(id);
      continue;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await stripe.coupons.create(
      {
        id,
        name: PRICING.foundingPromoCode,
        amount_off: cadCents(foundingAmountOffCad(spec.plan, spec.interval)),
        currency: "cad",
        duration: "forever",
        applies_to: { products: [spec.productId] },
        metadata: {
          founding: "true",
          plan: spec.plan,
          interval: spec.interval,
        },
      },
      { idempotencyKey: `${id}_v1` },
    );
  }
}

export type StripeDiscountParam =
  | { coupon: string }
  | { promotion_code: string };

export async function foundingDiscountForCustomer(
  customerId: string,
  plan: PricingPlanId,
  interval: BillingInterval,
): Promise<StripeDiscountParam> {
  const stripe = getStripe();
  const coupon = foundingCouponId(plan, interval);
  try {
    const listed = await stripe.promotionCodes.list({
      customer: customerId,
      code: PRICING.foundingPromoCode,
      active: true,
      limit: 10,
    });
    const existing = listed.data.find((promo) => {
      const attached = promo.promotion.coupon;
      const attachedId =
        typeof attached === "string" ? attached : attached?.id;
      return attachedId === coupon;
    });
    if (existing) return { promotion_code: existing.id };

    const created = await stripe.promotionCodes.create({
      code: PRICING.foundingPromoCode,
      customer: customerId,
      promotion: { type: "coupon", coupon },
      metadata: { founding: "true", plan, interval },
    });
    return { promotion_code: created.id };
  } catch (error) {
    console.error("founding promo code:", error);
    return { coupon };
  }
}

export function foundingCouponDiscount(
  plan: PricingPlanId,
  interval: BillingInterval,
): { coupon: string } {
  return { coupon: foundingCouponId(plan, interval) };
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
  if (missing.length > 0) {
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
  }

  await archiveLegacyFoundingPrices(stripe);
  if (missing.length > 0) {
    await setListPricesAsDefault(stripe, byKey);
  }

  const prices = Object.fromEntries(
    LOOKUP_KEYS.map((key) => [key, byKey.get(key)!]),
  ) as Record<PriceLookupKey, string>;
  await ensureFoundingCoupons(stripe, prices);
  return prices;
}
