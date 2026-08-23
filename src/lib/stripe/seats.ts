import "server-only";

import type Stripe from "stripe";

import {
  catalogForOccupancy,
  catalogFromLicensed,
  renewalSeatTarget,
  type BillingInterval,
  type SeatCatalog,
} from "@/lib/billing/plans";
import { occupancyCount } from "@/lib/billing/occupancy";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import {
  ensureBillingPrices,
  extraSeatLookupKey,
  foundingCouponDiscount,
  planPriceLookupKey,
  type PriceLookupKey,
} from "@/lib/stripe/catalog";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  loadOrgBilling,
  parseSubscriptionItems,
  syncOrgFromSubscription,
} from "@/lib/stripe/sync";
import { createServiceClient } from "@/lib/supabase/admin";

export type SeatSyncError =
  | "not_configured"
  | "not_found"
  | "seat_charge_failed";

function subscriptionItemsForCatalog(
  subscription: Stripe.Subscription,
  prices: Record<PriceLookupKey, string>,
  catalog: SeatCatalog,
  interval: BillingInterval,
  founding: boolean,
): Array<{
  id?: string;
  price?: string;
  quantity?: number;
  deleted?: boolean;
}> {
  let planItemId: string | undefined;
  let extraItemId: string | undefined;
  for (const item of subscription.items.data) {
    const key = item.price.lookup_key ?? "";
    if (key.startsWith("extra_seat")) extraItemId = item.id;
    else if (key.startsWith("standard_") || key.startsWith("team_")) {
      planItemId = item.id;
    }
  }

  const items: Array<{
    id?: string;
    price?: string;
    quantity?: number;
    deleted?: boolean;
  }> = [
    {
      id: planItemId,
      price: prices[planPriceLookupKey(catalog.plan, interval)],
      quantity: 1,
    },
  ];

  if (catalog.extraSeats > 0) {
    items.push({
      id: extraItemId,
      price: prices[extraSeatLookupKey(interval, founding)],
      quantity: catalog.extraSeats,
    });
  } else if (extraItemId) {
    items.push({ id: extraItemId, deleted: true });
  }

  return items;
}

export { occupancyCount };

async function applyCatalog(input: {
  orgId: string;
  subscription: Stripe.Subscription;
  catalog: SeatCatalog;
  interval: BillingInterval;
  founding: boolean;
  proration: Stripe.SubscriptionUpdateParams.ProrationBehavior;
  collectPayment: boolean;
}): Promise<Stripe.Subscription> {
  const prices = await ensureBillingPrices();
  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(input.subscription.id, {
    items: subscriptionItemsForCatalog(
      input.subscription,
      prices,
      input.catalog,
      input.interval,
      input.founding,
    ),
    proration_behavior: input.proration,
    ...(input.collectPayment
      ? { payment_behavior: "error_if_incomplete" as const }
      : {}),
    discounts: input.founding
      ? [foundingCouponDiscount(input.catalog.plan, input.interval)]
      : "",
    metadata: {
      organization_id: input.orgId,
      plan: input.catalog.plan,
      interval: input.interval,
      founding: input.founding ? "true" : "false",
    },
    expand: ["items.data.price"],
  });
  await syncOrgFromSubscription(updated, input.orgId);
  return updated;
}

function catalogsMatch(a: SeatCatalog, b: SeatCatalog): boolean {
  return (
    a.plan === b.plan &&
    a.extraSeats === b.extraSeats &&
    a.seatQuantity === b.seatQuantity
  );
}

function catalogFromSubscription(
  subscription: Stripe.Subscription,
  founding: boolean,
): {
  catalog: SeatCatalog | null;
  interval: BillingInterval | null;
} {
  const parsed = parseSubscriptionItems(subscription);
  if (!parsed.plan || !parsed.interval) {
    return { catalog: null, interval: parsed.interval };
  }
  return {
    catalog: catalogFromLicensed(parsed.plan, parsed.seatQuantity, founding),
    interval: parsed.interval,
  };
}

/**
 * Mid-cycle adds: if occupancy is over licensed seats, upgrade to the
 * cheapest covering catalog and invoice the prorated difference now.
 * Removals never call this — licensed seats stay unless the admin opts
 * into dropping unused seats at renewal.
 */
export async function ensureLicensedSeats(input: {
  orgId: string;
  occupancy: number;
}): Promise<{ ok: true } | { ok: false; error: SeatSyncError }> {
  if (!stripeConfigured()) return { ok: false, error: "not_configured" };

  const billing = await loadOrgBilling(input.orgId);
  if (!billing?.stripe_subscription_id) return { ok: true };

  const founding = Boolean(billing.founding_rate);
  const needed = catalogForOccupancy(input.occupancy, founding);
  const licensed = billing.billing_seat_quantity ?? 1;
  if (needed.seatQuantity <= licensed) return { ok: true };

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      billing.stripe_subscription_id,
      { expand: ["items.data.price"] },
    );
    const current = catalogFromSubscription(subscription, founding);
    const interval =
      current.interval ??
      (billing.billing_interval === "year" ? "year" : "month");
    if (current.catalog && catalogsMatch(current.catalog, needed)) {
      return { ok: true };
    }
    await applyCatalog({
      orgId: input.orgId,
      subscription,
      catalog: needed,
      interval,
      founding,
      proration: "always_invoice",
      collectPayment: true,
    });
    return { ok: true };
  } catch (error) {
    console.error("ensureLicensedSeats:", error);
    return { ok: false, error: "seat_charge_failed" };
  }
}

export async function setOrgSeatTrueUp(orgId: string, enabled: boolean) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("organizations")
    .update({
      billing_seat_true_up: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (error) {
    console.error("setOrgSeatTrueUp:", error.message);
    throw new Error("true_up_save_failed");
  }
}

/**
 * Renewal invoice: drop unused seats only when the admin opted in.
 * Otherwise keep licensed quantity (may still switch to a cheaper plan mix
 * for the same seat count). Occupancy over licensed is covered on this invoice.
 */
export async function trueUpLicensedSeatsForRenewal(
  subscriptionId: string,
): Promise<void> {
  if (!stripeConfigured()) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  const orgId = subscription.metadata.organization_id;
  if (!orgId) return;

  const billing = await loadOrgBilling(orgId);
  const founding = Boolean(billing?.founding_rate);
  const occupancy = await occupancyCount(orgId);
  const licensed = billing?.billing_seat_quantity ?? 1;
  const trueUp = Boolean(billing?.billing_seat_true_up);
  const needed = catalogForOccupancy(
    renewalSeatTarget({ licensed, occupancy, trueUp }),
    founding,
  );
  const current = catalogFromSubscription(subscription, founding);
  if (!current.catalog || !current.interval) return;
  if (catalogsMatch(current.catalog, needed)) return;

  const shrinking = needed.seatQuantity < current.catalog.seatQuantity;
  if (shrinking && !trueUp) return;
  if (
    needed.monthlyCad > current.catalog.monthlyCad &&
    needed.seatQuantity <= current.catalog.seatQuantity
  ) {
    return;
  }

  try {
    await applyCatalog({
      orgId,
      subscription,
      catalog: needed,
      interval: current.interval,
      founding,
      proration: "none",
      collectPayment: false,
    });
  } catch (error) {
    console.error("trueUpLicensedSeatsForRenewal:", error);
  }
}

export async function updateSubscriptionCatalog(input: {
  orgId: string;
  interval: BillingInterval;
  occupancy: number;
}): Promise<
  | { ok: true; catalog: SeatCatalog; fromPlan: PricingPlanId | null }
  | { ok: false; error: SeatSyncError }
> {
  const billing = await loadOrgBilling(input.orgId);
  if (!billing?.stripe_subscription_id) return { ok: false, error: "not_found" };

  const founding = Boolean(billing.founding_rate);
  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      billing.stripe_subscription_id,
      { expand: ["items.data.price"] },
    );
    const current = catalogFromSubscription(subscription, founding);
    const needed = catalogForOccupancy(input.occupancy, founding);
    const catalog =
      needed.seatQuantity > (current.catalog?.seatQuantity ?? 0)
        ? needed
        : (current.catalog ?? needed);

    await applyCatalog({
      orgId: input.orgId,
      subscription,
      catalog,
      interval: input.interval,
      founding,
      proration: "always_invoice",
      collectPayment: true,
    });
    return { ok: true, catalog, fromPlan: current.catalog?.plan ?? null };
  } catch (error) {
    console.error("updateSubscriptionCatalog:", error);
    return { ok: false, error: "seat_charge_failed" };
  }
}
