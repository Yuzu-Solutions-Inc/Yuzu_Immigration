import "server-only";

import type Stripe from "stripe";

import {
  catalogFromLicensed,
  type BillingInterval,
  type SeatCatalog,
} from "@/lib/billing/plans";
import { transitionAfterSeatAdd } from "@/lib/billing/transitions";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import {
  ensureBillingPrices,
  extraSeatLookupKey,
  foundingCouponDiscount,
  parseLookupKey,
  planPriceLookupKey,
  type PriceLookupKey,
} from "@/lib/stripe/catalog";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  clearPendingLicenses,
  loadOrgBilling,
  parseSubscriptionItems,
  savePendingBilling,
  syncOrgFromSubscription,
} from "@/lib/stripe/sync";

export type SeatSyncError =
  | "not_configured"
  | "not_found"
  | "seat_charge_failed";

type CatalogSubscriptionItem = {
  id?: string;
  price?: string;
  quantity?: number;
  deleted?: boolean;
};

function toBillingInterval(
  value: string | null | undefined,
): BillingInterval | null {
  if (value === "year") return "year";
  if (value === "month") return "month";
  return null;
}

function itemBillingInterval(
  item: Stripe.SubscriptionItem,
): BillingInterval | null {
  const parsed = parseLookupKey(item.price.lookup_key);
  if (parsed) return parsed.interval;
  return toBillingInterval(item.price.recurring?.interval);
}

function subscriptionBillingInterval(
  subscription: Stripe.Subscription,
): BillingInterval | null {
  for (const item of subscription.items.data) {
    const interval = itemBillingInterval(item);
    if (interval) return interval;
  }
  return null;
}

function existingCatalogItemIds(subscription: Stripe.Subscription): {
  planItemId?: string;
  extraItemId?: string;
} {
  let planItemId: string | undefined;
  let extraItemId: string | undefined;
  for (const item of subscription.items.data) {
    const key = item.price.lookup_key ?? "";
    const parsed = parseLookupKey(key);
    if (parsed?.plan === "extra_seat" || key.startsWith("extra_seat")) {
      extraItemId = item.id;
    } else if (
      parsed?.plan === "standard" ||
      parsed?.plan === "team" ||
      key.startsWith("standard_") ||
      key.startsWith("team_")
    ) {
      planItemId = item.id;
    }
  }
  if (!planItemId) {
    const leftover = subscription.items.data.find(
      (item) => item.id !== extraItemId,
    );
    planItemId = leftover?.id;
  }
  return { planItemId, extraItemId };
}

/**
 * Classic Stripe billing rejects mixed intervals. Updating a monthly item
 * to a yearly price while adding a new yearly extra-seat item fails, and
 * legacy Team subscriptions have no extra-seat item to update in place.
 * Interval changes therefore replace every item in one request.
 */
function subscriptionItemsForCatalog(
  subscription: Stripe.Subscription,
  prices: Record<PriceLookupKey, string>,
  catalog: SeatCatalog,
  interval: BillingInterval,
  founding: boolean,
): CatalogSubscriptionItem[] {
  const currentInterval = subscriptionBillingInterval(subscription);
  const replaceAll = Boolean(currentInterval && currentInterval !== interval);

  if (replaceAll) {
    const items: CatalogSubscriptionItem[] = subscription.items.data.map(
      (item) => ({ id: item.id, deleted: true }),
    );
    items.push({
      price: prices[planPriceLookupKey(catalog.plan, interval)],
      quantity: 1,
    });
    if (catalog.extraSeats > 0) {
      items.push({
        price: prices[extraSeatLookupKey(interval, founding)],
        quantity: catalog.extraSeats,
      });
    }
    return items;
  }

  const { planItemId, extraItemId } = existingCatalogItemIds(subscription);
  const items: CatalogSubscriptionItem[] = [
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

function pendingInvoiceUrl(subscription: Stripe.Subscription): string | null {
  const pending = (
    subscription as Stripe.Subscription & { pending_update?: unknown }
  ).pending_update;
  if (!pending) return null;
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === "string") return null;
  return "hosted_invoice_url" in invoice
    ? (invoice.hosted_invoice_url ?? null)
    : null;
}

async function applyCatalog(input: {
  orgId: string;
  subscription: Stripe.Subscription;
  catalog: SeatCatalog;
  interval: BillingInterval;
  founding: boolean;
  proration: Stripe.SubscriptionUpdateParams.ProrationBehavior;
  collectPayment: boolean;
}): Promise<{ subscription: Stripe.Subscription; paymentUrl?: string }> {
  const prices = await ensureBillingPrices();
  const stripe = getStripe();
  const intervalChanged =
    subscriptionBillingInterval(input.subscription) !== input.interval;
  const updated = await stripe.subscriptions.update(input.subscription.id, {
    items: subscriptionItemsForCatalog(
      input.subscription,
      prices,
      input.catalog,
      input.interval,
      input.founding,
    ),
    proration_behavior: input.proration,
    ...(intervalChanged && input.subscription.status !== "trialing"
      ? { billing_cycle_anchor: "now" as const }
      : {}),
    ...(input.collectPayment
      ? { payment_behavior: "allow_incomplete" as const }
      : {}),
    ...(input.founding
      ? {
          discounts: [
            foundingCouponDiscount(input.catalog.plan, input.interval),
          ],
        }
      : {}),
    metadata: {
      organization_id: input.orgId,
      plan: input.catalog.plan,
      interval: input.interval,
      founding: input.founding ? "true" : "false",
    },
    expand: ["items.data.price", "latest_invoice"],
  });
  const paymentUrl = pendingInvoiceUrl(updated) ?? undefined;
  if (!paymentUrl) {
    await syncOrgFromSubscription(updated, input.orgId);
  }
  return { subscription: updated, paymentUrl };
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

function scheduleIdFromSubscription(
  subscription: Stripe.Subscription,
): string | null {
  const schedule = subscription.schedule;
  if (!schedule) return null;
  return typeof schedule === "string" ? schedule : schedule.id;
}

function subscriptionPeriodStart(subscription: Stripe.Subscription): number {
  const starts = subscription.items.data
    .map((item) => item.current_period_start)
    .filter((value): value is number => typeof value === "number");
  return starts.length ? Math.min(...starts) : Math.floor(Date.now() / 1000);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  if (!ends.length) throw new Error("missing_subscription_period");
  return Math.max(...ends);
}

function scheduleItemsFromSubscription(subscription: Stripe.Subscription) {
  return subscription.items.data.map((item) => ({
    price: item.price.id,
    quantity: item.quantity ?? 1,
  }));
}

function scheduleDiscountsFromSubscription(
  subscription: Stripe.Subscription,
): Array<{ discount: string }> {
  return (subscription.discounts ?? []).map((discount) => ({
    discount: typeof discount === "string" ? discount : discount.id,
  }));
}

async function scheduleItemsForCatalog(
  catalog: SeatCatalog,
  interval: BillingInterval,
  founding: boolean,
) {
  const prices = await ensureBillingPrices();
  const items = [
    {
      price: prices[planPriceLookupKey(catalog.plan, interval)],
      quantity: 1,
    },
  ];
  if (catalog.extraSeats > 0) {
    items.push({
      price: prices[extraSeatLookupKey(interval, founding)],
      quantity: catalog.extraSeats,
    });
  }
  return items;
}

async function releaseActiveSchedule(
  subscription: Stripe.Subscription,
  scheduleIdHint?: string | null,
): Promise<Stripe.Subscription> {
  const scheduleId = scheduleIdHint ?? scheduleIdFromSubscription(subscription);
  if (!scheduleId) return subscription;
  const stripe = getStripe();
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  if (schedule.status === "active" || schedule.status === "not_started") {
    await stripe.subscriptionSchedules.release(scheduleId);
  }
  return stripe.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price", "latest_invoice"],
  });
}

async function createRenewalSchedule(input: {
  orgId: string;
  subscription: Stripe.Subscription;
  catalog: SeatCatalog;
  interval: BillingInterval;
  founding: boolean;
}): Promise<string> {
  const stripe = getStripe();
  const periodStart = subscriptionPeriodStart(input.subscription);
  const periodEnd = subscriptionPeriodEnd(input.subscription);
  const current = catalogFromSubscription(input.subscription, input.founding);
  if (!current.catalog || !current.interval) {
    throw new Error("unrecognized_subscription_catalog");
  }
  const created = await stripe.subscriptionSchedules.create({
    from_subscription: input.subscription.id,
  });
  const targetItems = await scheduleItemsForCatalog(
    input.catalog,
    input.interval,
    input.founding,
  );
  const existingDiscounts = scheduleDiscountsFromSubscription(
    input.subscription,
  );
  const currentDiscounts = input.founding
    ? [foundingCouponDiscount(current.catalog.plan, current.interval)]
    : existingDiscounts;
  const targetDiscounts = input.founding
    ? [foundingCouponDiscount(input.catalog.plan, input.interval)]
    : existingDiscounts;
  await stripe.subscriptionSchedules.update(created.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      {
        start_date: periodStart,
        end_date: periodEnd,
        items: scheduleItemsFromSubscription(input.subscription),
        proration_behavior: "none",
        ...(currentDiscounts.length ? { discounts: currentDiscounts } : {}),
      },
      {
        start_date: periodEnd,
        duration: { interval: input.interval, interval_count: 1 },
        billing_cycle_anchor: "phase_start",
        items: targetItems,
        proration_behavior: "none",
        ...(targetDiscounts.length ? { discounts: targetDiscounts } : {}),
        metadata: {
          organization_id: input.orgId,
          plan: input.catalog.plan,
          interval: input.interval,
          founding: input.founding ? "true" : "false",
        },
      },
    ],
    metadata: { organization_id: input.orgId },
  });
  return created.id;
}

async function setRenewalCatalog(input: {
  orgId: string;
  subscription: Stripe.Subscription;
  catalog: SeatCatalog;
  interval: BillingInterval;
  founding: boolean;
  scheduleId?: string | null;
}) {
  const current = catalogFromSubscription(input.subscription, input.founding);
  if (!current.catalog || !current.interval) {
    throw new Error("unrecognized_subscription_catalog");
  }

  const existingScheduleId =
    input.scheduleId ?? scheduleIdFromSubscription(input.subscription);
  const noChange =
    catalogsMatch(current.catalog, input.catalog) &&
    current.interval === input.interval;
  if (existingScheduleId && !noChange) {
    await savePendingBilling({
      orgId: input.orgId,
      seatQuantity: input.catalog.seatQuantity,
      interval: input.interval,
      effectiveAt: new Date(
        subscriptionPeriodEnd(input.subscription) * 1000,
      ).toISOString(),
      scheduleId: null,
    });
  }
  const released = await releaseActiveSchedule(
    input.subscription,
    existingScheduleId,
  );
  if (noChange) {
    await clearPendingLicenses(input.orgId);
    await savePendingBilling({
      orgId: input.orgId,
      seatQuantity: null,
      interval: null,
      effectiveAt: null,
      scheduleId: null,
    });
    return null;
  }

  const scheduleId = await createRenewalSchedule({
    ...input,
    subscription: released,
  });
  await savePendingBilling({
    orgId: input.orgId,
    seatQuantity: input.catalog.seatQuantity,
    interval: input.interval,
    effectiveAt: new Date(subscriptionPeriodEnd(released) * 1000).toISOString(),
    scheduleId,
  });
  return scheduleId;
}

export async function addLicensedSeats(input: {
  orgId: string;
  quantity: number;
}): Promise<
  | {
      ok: true;
      currentSeats: number;
      nextSeats: number;
      paymentUrl?: string;
    }
  | { ok: false; error: SeatSyncError }
> {
  if (!stripeConfigured()) return { ok: false, error: "not_configured" };
  const billing = await loadOrgBilling(input.orgId);
  if (!billing?.stripe_subscription_id) return { ok: false, error: "not_found" };

  const founding = Boolean(billing.founding_rate);
  const currentSeats = Math.max(1, billing.billing_seat_quantity ?? 1);
  const currentInterval: BillingInterval =
    billing.billing_interval === "year" ? "year" : "month";
  const nextInterval: BillingInterval =
    billing.billing_pending_interval === "year"
      ? "year"
      : billing.billing_pending_interval === "month"
        ? "month"
        : currentInterval;
  const hadPending = Boolean(
    billing.billing_pending_seat_quantity ||
      billing.billing_pending_interval ||
      billing.stripe_subscription_schedule_id,
  );
  const transition = transitionAfterSeatAdd(
    {
      currentSeats,
      nextSeats:
        billing.billing_pending_seat_quantity ?? currentSeats,
      currentInterval,
      nextInterval,
    },
    input.quantity,
  );

  try {
    const stripe = getStripe();
    let subscription = await stripe.subscriptions.retrieve(
      billing.stripe_subscription_id,
      { expand: ["items.data.price", "latest_invoice"] },
    );
    subscription = await releaseActiveSchedule(
      subscription,
      billing.stripe_subscription_schedule_id,
    );

    if (hadPending) {
      await savePendingBilling({
        orgId: input.orgId,
        seatQuantity: transition.nextSeats,
        interval: nextInterval,
        effectiveAt:
          billing.billing_pending_effective_at ??
          new Date(subscriptionPeriodEnd(subscription) * 1000).toISOString(),
        scheduleId: null,
      });
    }

    const applied = await applyCatalog({
      orgId: input.orgId,
      subscription,
      catalog: catalogFromLicensed(
        "standard",
        transition.currentSeats,
        founding,
      ),
      interval: currentInterval,
      founding,
      proration: "always_invoice",
      collectPayment: true,
    });

    if (hadPending) {
      await setRenewalCatalog({
        orgId: input.orgId,
        subscription: applied.subscription,
        catalog: catalogFromLicensed(
          "standard",
          transition.nextSeats,
          founding,
        ),
        interval: nextInterval,
        founding,
      });
    }

    return {
      ok: true,
      currentSeats: transition.currentSeats,
      nextSeats: hadPending
        ? transition.nextSeats
        : transition.currentSeats,
      paymentUrl: applied.paymentUrl,
    };
  } catch (error) {
    console.error("addLicensedSeats:", error);
    try {
      await ensurePendingRenewalSchedule(input.orgId);
    } catch (restoreError) {
      console.error("restore pending schedule after add:", restoreError);
    }
    return { ok: false, error: "seat_charge_failed" };
  }
}

export async function scheduleLicensedSeats(input: {
  orgId: string;
  seatQuantity: number;
  interval?: BillingInterval;
}): Promise<
  | { ok: true; nextSeats: number; nextInterval: BillingInterval }
  | { ok: false; error: SeatSyncError }
> {
  if (!stripeConfigured()) return { ok: false, error: "not_configured" };
  const billing = await loadOrgBilling(input.orgId);
  if (!billing?.stripe_subscription_id) return { ok: false, error: "not_found" };
  const founding = Boolean(billing.founding_rate);
  const nextInterval: BillingInterval =
    input.interval ??
    (billing.billing_pending_interval === "year"
      ? "year"
      : billing.billing_pending_interval === "month"
        ? "month"
        : billing.billing_interval === "year"
          ? "year"
          : "month");

  try {
    const subscription = await getStripe().subscriptions.retrieve(
      billing.stripe_subscription_id,
      { expand: ["items.data.price"] },
    );
    await setRenewalCatalog({
      orgId: input.orgId,
      subscription,
      catalog: catalogFromLicensed(
        "standard",
        Math.max(1, input.seatQuantity),
        founding,
      ),
      interval: nextInterval,
      founding,
      scheduleId: billing.stripe_subscription_schedule_id,
    });
    return {
      ok: true,
      nextSeats: Math.max(1, input.seatQuantity),
      nextInterval,
    };
  } catch (error) {
    console.error("scheduleLicensedSeats:", error);
    try {
      await ensurePendingRenewalSchedule(input.orgId);
    } catch (restoreError) {
      console.error("restore pending schedule:", restoreError);
    }
    return { ok: false, error: "seat_charge_failed" };
  }
}

export async function ensurePendingRenewalSchedule(orgId: string) {
  const billing = await loadOrgBilling(orgId);
  if (
    !billing?.stripe_subscription_id ||
    !billing.billing_pending_seat_quantity ||
    !billing.billing_pending_interval ||
    billing.stripe_subscription_schedule_id
  ) {
    return;
  }
  const subscription = await getStripe().subscriptions.retrieve(
    billing.stripe_subscription_id,
    { expand: ["items.data.price"] },
  );
  await setRenewalCatalog({
    orgId,
    subscription,
    catalog: catalogFromLicensed(
      "standard",
      billing.billing_pending_seat_quantity,
      Boolean(billing.founding_rate),
    ),
    interval:
      billing.billing_pending_interval === "year" ? "year" : "month",
    founding: Boolean(billing.founding_rate),
  });
}

export async function updateSubscriptionCatalog(input: {
  orgId: string;
  interval: BillingInterval;
}): Promise<
  | {
      ok: true;
      catalog: SeatCatalog;
      fromPlan: PricingPlanId | null;
      paymentUrl?: string;
    }
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
    const targetSeats =
      billing.billing_pending_seat_quantity ??
      current.catalog?.seatQuantity ??
      Math.max(1, billing.billing_seat_quantity ?? 1);
    const catalog = catalogFromLicensed("standard", targetSeats, founding);

    await setRenewalCatalog({
      orgId: input.orgId,
      subscription,
      catalog,
      interval: input.interval,
      founding,
      scheduleId: billing.stripe_subscription_schedule_id,
    });
    return {
      ok: true,
      catalog,
      fromPlan: current.catalog?.plan ?? null,
    };
  } catch (error) {
    console.error("updateSubscriptionCatalog:", error);
    return { ok: false, error: "seat_charge_failed" };
  }
}
