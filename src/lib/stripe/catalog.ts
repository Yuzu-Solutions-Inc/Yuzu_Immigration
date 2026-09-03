import "server-only";

import {
  annualTotal,
  foundingAmountOffCad,
  PRICING,
  type PricingPlanId,
} from "@/lib/marketing/pricing";
import type { BillingInterval } from "@/lib/billing/plans";
import { product as brandProduct } from "@/lib/brand/product";
import { getStripe } from "@/lib/stripe/client";
import {
  foundingCouponId,
  isFoundingCouponId,
  isLegacyForeverFoundingCouponId,
  legacyForeverFoundingCouponId,
  remainingFoundingPromoMonths,
} from "@/lib/stripe/founding-ids";
import type Stripe from "stripe";

export {
  foundingCouponId,
  isFoundingCouponId,
  isLegacyForeverFoundingCouponId,
  legacyForeverFoundingCouponId,
  remainingFoundingPromoMonths,
};

export type PriceLookupKey =
  | "standard_list_monthly"
  | "standard_list_yearly"
  | "extra_seat_monthly"
  | "extra_seat_yearly"
  | "extra_seat_founding_monthly"
  | "extra_seat_founding_yearly";

const LOOKUP_KEYS: PriceLookupKey[] = [
  "standard_list_monthly",
  "standard_list_yearly",
  "extra_seat_monthly",
  "extra_seat_yearly",
  "extra_seat_founding_monthly",
  "extra_seat_founding_yearly",
];

const LEGACY_TEAM_LOOKUP_KEYS = [
  "team_list_monthly",
  "team_list_yearly",
] as const;

const LEGACY_FOUNDING_LOOKUP_KEYS = [
  "standard_founding_monthly",
  "standard_founding_yearly",
  "team_founding_monthly",
  "team_founding_yearly",
] as const;

function cadCents(dollars: number): number {
  return dollars * 100;
}

function specFor(key: PriceLookupKey): {
  productKey: "standard" | "extra_seat";
  unitAmount: number;
  interval: BillingInterval;
} {
  const extraMonthly = PRICING.extraSeatMonthly;
  const extraFounding = PRICING.extraSeatFoundingMonthly;
  const map: Record<
    PriceLookupKey,
    { productKey: "standard" | "extra_seat"; unitAmount: number; interval: BillingInterval }
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
    extra_seat_founding_monthly: {
      productKey: "extra_seat",
      unitAmount: cadCents(extraFounding),
      interval: "month",
    },
    extra_seat_founding_yearly: {
      productKey: "extra_seat",
      unitAmount: cadCents(annualTotal(extraFounding)),
      interval: "year",
    },
  };
  return map[key];
}

const PRODUCT_NAMES = {
  standard: brandProduct.name,
  extra_seat: `${brandProduct.name} extra staff seat`,
} as const;

// Stripe's "Software as a service (SaaS) — business use" tax code.
const SAAS_TAX_CODE = "txcd_10103001";

export function planPriceLookupKey(
  _plan: PricingPlanId,
  interval: BillingInterval,
): PriceLookupKey {
  const period = interval === "year" ? "yearly" : "monthly";
  return `standard_list_${period}` as PriceLookupKey;
}

export function extraSeatLookupKey(
  interval: BillingInterval,
  founding = false,
): PriceLookupKey {
  if (founding) {
    return interval === "year"
      ? "extra_seat_founding_yearly"
      : "extra_seat_founding_monthly";
  }
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
  if (key === "extra_seat_founding_monthly") {
    return { plan: "extra_seat", interval: "month", founding: true };
  }
  if (key === "extra_seat_founding_yearly") {
    return { plan: "extra_seat", interval: "year", founding: true };
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
  key: "standard" | "extra_seat",
): Promise<string> {
  const created = await stripe.products.create(
    {
      name: PRODUCT_NAMES[key],
      tax_code: SAAS_TAX_CODE,
      metadata: { plan: key },
    },
    { idempotencyKey: `permitos_product_${key}_v2` },
  );
  if (created.name !== PRODUCT_NAMES[key]) {
    await stripe.products.update(created.id, { name: PRODUCT_NAMES[key] });
  }
  return created.id;
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

async function archiveTeamPrices(stripe: Stripe) {
  const listed = await stripe.prices.list({
    lookup_keys: [...LEGACY_TEAM_LOOKUP_KEYS],
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
  if (standardMonthly) {
    const productId = await productIdForPrice(stripe, standardMonthly);
    await stripe.products.update(productId, { default_price: standardMonthly });
  }
}

async function ensureRepeatingFoundingCoupon(
  stripe: Stripe,
  spec: {
    plan: PricingPlanId;
    interval: BillingInterval;
    productId: string;
    months: number;
  },
): Promise<string> {
  const id = foundingCouponId(spec.plan, spec.interval, spec.months);
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  await stripe.coupons.create(
    {
      id,
      name: PRICING.foundingPromoCode,
      amount_off: cadCents(foundingAmountOffCad(spec.plan, spec.interval)),
      currency: "cad",
      duration: "repeating",
      duration_in_months: spec.months,
      applies_to: { products: [spec.productId] },
      metadata: {
        founding: "true",
        plan: spec.plan,
        interval: spec.interval,
        months: String(spec.months),
      },
    },
    { idempotencyKey: `${id}_v1` },
  );
  return id;
}

export async function ensureFoundingCoupons(
  stripe: Stripe,
  prices: Record<PriceLookupKey, string>,
): Promise<void> {
  const standardProduct = await productIdForPrice(
    stripe,
    prices.standard_list_monthly,
  );
  const specs: Array<{
    plan: PricingPlanId;
    interval: BillingInterval;
    productId: string;
  }> = [
    { plan: "standard", interval: "month", productId: standardProduct },
    { plan: "standard", interval: "year", productId: standardProduct },
  ];

  for (const spec of specs) {
    await ensureRepeatingFoundingCoupon(stripe, {
      ...spec,
      months: PRICING.promoMonths,
    });
  }
}

export type StripeDiscountParam =
  | { coupon: string }
  | { promotion_code: string };

export type FoundingDiscountOptions = {
  forever?: boolean;
  months?: number;
};

export async function foundingDiscountForCustomer(
  customerId: string,
  plan: PricingPlanId,
  interval: BillingInterval,
  options?: FoundingDiscountOptions,
): Promise<StripeDiscountParam> {
  if (options?.forever) {
    return foundingCouponDiscount(plan, interval, true);
  }

  const months = options?.months ?? PRICING.promoMonths;
  const stripe = getStripe();
  if (months !== PRICING.promoMonths) {
    const prices = await ensureBillingPrices();
    const productId = await productIdForPrice(
      stripe,
      prices.standard_list_monthly,
    );
    const coupon = await ensureRepeatingFoundingCoupon(stripe, {
      plan,
      interval,
      productId,
      months,
    });
    return { coupon };
  }

  const coupon = foundingCouponId(plan, interval, months);
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
      metadata: { founding: "true", plan, interval, months: String(months) },
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
  forever = false,
): { coupon: string } {
  return {
    coupon: forever
      ? legacyForeverFoundingCouponId(plan, interval)
      : foundingCouponId(plan, interval),
  };
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
  const existingByKey = new Map<string, Stripe.Price>();
  for (const price of listed.data) {
    if (price.lookup_key) existingByKey.set(price.lookup_key, price);
  }

  const productIds: Partial<Record<"standard" | "extra_seat", string>> = {};

  async function productFor(
    key: "standard" | "extra_seat",
    fromPrice?: Stripe.Price,
  ): Promise<string> {
    const cached = productIds[key];
    if (cached) return cached;
    const id = fromPrice
      ? await productIdForPrice(stripe, fromPrice.id)
      : await ensureProduct(stripe, key);
    productIds[key] = id;
    return id;
  }

  const byKey = new Map<string, string>();
  for (const key of LOOKUP_KEYS) {
    const spec = specFor(key);
    const existing = existingByKey.get(key);
    if (existing && existing.unit_amount === spec.unitAmount) {
      byKey.set(key, existing.id);
      continue;
    }
    const price = await stripe.prices.create(
      {
        currency: "cad",
        product: await productFor(spec.productKey, existing),
        unit_amount: spec.unitAmount,
        recurring: { interval: spec.interval },
        lookup_key: key,
        transfer_lookup_key: true,
        tax_behavior: "exclusive",
        metadata: { lookup: key },
      },
      { idempotencyKey: `permitos_price_${key}_${spec.unitAmount}` },
    );
    byKey.set(key, price.id);
    if (existing?.active && existing.id !== price.id) {
      await stripe.prices.update(existing.id, { active: false });
    }
  }

  await archiveLegacyFoundingPrices(stripe);
  await archiveTeamPrices(stripe);
  await setListPricesAsDefault(stripe, byKey);
  await syncCatalogProductNames(stripe, byKey);

  const prices = Object.fromEntries(
    LOOKUP_KEYS.map((key) => [key, byKey.get(key)!]),
  ) as Record<PriceLookupKey, string>;
  await ensureFoundingCoupons(stripe, prices);
  return prices;
}

async function syncCatalogProductNames(
  stripe: Stripe,
  byKey: Map<string, string>,
) {
  const targets: Array<[string, keyof typeof PRODUCT_NAMES]> = [
    ["standard_list_monthly", "standard"],
    ["extra_seat_monthly", "extra_seat"],
  ];
  const seen = new Set<string>();
  for (const [lookup, productKey] of targets) {
    const priceId = byKey.get(lookup);
    if (!priceId) continue;
    const productId = await productIdForPrice(stripe, priceId);
    if (seen.has(productId)) continue;
    seen.add(productId);
    await stripe.products.update(productId, { name: PRODUCT_NAMES[productKey] });
  }
}
