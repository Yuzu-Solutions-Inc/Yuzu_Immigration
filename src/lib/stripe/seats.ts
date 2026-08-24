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
  catalogItemsNeedReplaceAll,
  compactCatalogItem,
  subscriptionAutomaticTaxParams,
} from "@/lib/stripe/subscription-items";
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

function expandedPrice(
  price: Stripe.SubscriptionItem["price"] | null | undefined,
): Stripe.Price | null {
  if (!price || typeof price === "string") return null;
  if ("deleted" in price && price.deleted) return null;
  return price;
}

function itemBillingInterval(
  item: Stripe.SubscriptionItem,
): BillingInterval | null {
  const price = expandedPrice(item.price);
  const parsed = parseLookupKey(price?.lookup_key);
  if (parsed) return parsed.interval;
  return toBillingInterval(price?.recurring?.interval);
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
    const key = expandedPrice(item.price)?.lookup_key ?? "";
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
 * Interval changes and Team-to-Standard conversions therefore replace
 * every item in one request.
 */
function subscriptionItemsForCatalog(
  subscription: Stripe.Subscription,
  prices: Record<PriceLookupKey, string>,
  catalog: SeatCatalog,
  interval: BillingInterval,
  founding: boolean,
): CatalogSubscriptionItem[] {
  const currentInterval = subscriptionBillingInterval(subscription);
  const lookupKeys = subscription.items.data.map(
    (item) => expandedPrice(item.price)?.lookup_key ?? "",
  );
  const replaceAll = catalogItemsNeedReplaceAll(
    currentInterval,
    interval,
    lookupKeys,
  );

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
    return items.map(compactCatalogItem);
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

  return items.map(compactCatalogItem);
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
    ...subscriptionAutomaticTaxParams(input.subscription),
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
    try {
      await syncOrgFromSubscription(updated, input.orgId);
    } catch (error) {
      console.error("applyCatalog sync:", error);
    }
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

function subscriptionPeriodEnd(subscription: Stripe.Subscription): number {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  if (ends.length) return Math.max(...ends);
  const legacyEnd = (
    subscription as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  if (typeof legacyEnd === "number") return legacyEnd;
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

function phasePriceId(
  price: string | { id?: string } | null | undefined,
): string | null {
  if (typeof price === "string") return price;
  if (price && typeof price === "object" && "id" in price) {
    return price.id ?? null;
  }
  return null;
}

function phaseItems(phase: Stripe.SubscriptionSchedule.Phase) {
  return phase.items.flatMap((item) => {
    const id = phasePriceId(item.price);
    return id ? [{ price: id, quantity: item.quantity ?? 1 }] : [];
  });
}

type SchedulePhaseDiscount =
  Stripe.SubscriptionScheduleUpdateParams.Phase.Discount;

function phaseDiscounts(
  phase: Stripe.SubscriptionSchedule.Phase,
): SchedulePhaseDiscount[] {
  const discounts: SchedulePhaseDiscount[] = [];
  for (const entry of phase.discounts ?? []) {
    if (typeof entry === "string") {
      discounts.push({ discount: entry });
      continue;
    }
    const discount = entry.discount;
    if (typeof discount === "string") {
      discounts.push({ discount });
      continue;
    }
    if (discount && typeof discount === "object" && discount.id) {
      discounts.push({ discount: discount.id });
      continue;
    }
    const coupon = entry.coupon;
    if (typeof coupon === "string") {
      discounts.push({ coupon });
      continue;
    }
    if (coupon && typeof coupon === "object" && coupon.id) {
      discounts.push({ coupon: coupon.id });
      continue;
    }
    const promotionCode = entry.promotion_code;
    if (typeof promotionCode === "string") {
      discounts.push({ promotion_code: promotionCode });
      continue;
    }
    if (
      promotionCode &&
      typeof promotionCode === "object" &&
      promotionCode.id
    ) {
      discounts.push({ promotion_code: promotionCode.id });
    }
  }
  return discounts;
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

function scheduleIdsToRelease(
  subscription: Stripe.Subscription,
  scheduleIdHint?: string | null,
): string[] {
  const ids = new Set<string>();
  const attached = scheduleIdFromSubscription(subscription);
  if (attached) ids.add(attached);
  if (scheduleIdHint) ids.add(scheduleIdHint);
  return [...ids];
}

async function releaseActiveSchedule(
  subscription: Stripe.Subscription,
  scheduleIdHint?: string | null,
): Promise<Stripe.Subscription> {
  const scheduleIds = scheduleIdsToRelease(subscription, scheduleIdHint);
  if (!scheduleIds.length) return subscription;
  const stripe = getStripe();
  for (const scheduleId of scheduleIds) {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (schedule.status === "active" || schedule.status === "not_started") {
      await stripe.subscriptionSchedules.release(scheduleId);
    }
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
  const current = catalogFromSubscription(input.subscription, input.founding);
  if (!current.catalog || !current.interval) {
    throw new Error("unrecognized_subscription_catalog");
  }
  const created = await stripe.subscriptionSchedules.create({
    from_subscription: input.subscription.id,
  });
  const currentPhase = created.phases[0];
  if (!currentPhase) {
    throw new Error("missing_schedule_phase");
  }
  const phaseStart = currentPhase.start_date;
  const phaseEnd =
    currentPhase.end_date ?? subscriptionPeriodEnd(input.subscription);
  const targetItems = await scheduleItemsForCatalog(
    input.catalog,
    input.interval,
    input.founding,
  );
  const currentDiscounts = phaseDiscounts(currentPhase);
  const targetDiscounts: SchedulePhaseDiscount[] =
    input.founding && current.interval !== input.interval
      ? [foundingCouponDiscount(input.catalog.plan, input.interval)]
      : currentDiscounts;
  const automaticTax =
    currentPhase.automatic_tax?.enabled === true
      ? { enabled: true as const }
      : undefined;
  await stripe.subscriptionSchedules.update(created.id, {
    end_behavior: "release",
    proration_behavior: "none",
    phases: [
      {
        start_date: phaseStart,
        end_date: phaseEnd,
        ...(automaticTax ? { automatic_tax: automaticTax } : {}),
        items: phaseItems(currentPhase),
        proration_behavior: "none",
        ...(currentDiscounts.length ? { discounts: currentDiscounts } : {}),
      },
      {
        start_date: phaseEnd,
        duration: { interval: input.interval, interval_count: 1 },
        ...(automaticTax ? { automatic_tax: automaticTax } : {}),
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
    scheduleIdFromSubscription(input.subscription) ?? input.scheduleId ?? null;
  const noChange =
    catalogsMatch(current.catalog, input.catalog) &&
    current.interval === input.interval;
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
  try {
    await savePendingBilling({
      orgId: input.orgId,
      seatQuantity: input.catalog.seatQuantity,
      interval: input.interval,
      effectiveAt: new Date(subscriptionPeriodEnd(released) * 1000).toISOString(),
      scheduleId,
    });
  } catch (error) {
    console.error("savePendingBilling after schedule:", error);
  }
  return scheduleId;
}

export async function addLicensedSeats(input: {
  orgId: string;
  quantity: number;
  nextSeats?: number;
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
  const targetNextSeats = Math.max(
    1,
    input.nextSeats ??
      (hadPending ? transition.nextSeats : transition.currentSeats),
  );

  try {
    const stripe = getStripe();
    let subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(
      billing.stripe_subscription_id,
      { expand: ["items.data.price", "latest_invoice"] },
    );
    subscription = await releaseActiveSchedule(
      subscription,
      billing.stripe_subscription_schedule_id,
    );

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

    if (hadPending || targetNextSeats !== transition.currentSeats) {
      try {
        await setRenewalCatalog({
          orgId: input.orgId,
          subscription: applied.subscription,
          catalog: catalogFromLicensed(
            "standard",
            targetNextSeats,
            founding,
          ),
          interval: nextInterval,
          founding,
        });
      } catch (scheduleError) {
        console.error("addLicensedSeats renewal schedule:", scheduleError);
        try {
          await ensurePendingRenewalSchedule(input.orgId);
        } catch (restoreError) {
          console.error("restore pending schedule after add:", restoreError);
        }
      }
    }

    return {
      ok: true,
      currentSeats: transition.currentSeats,
      nextSeats: targetNextSeats,
      paymentUrl: applied.paymentUrl,
    };
  } catch (error) {
    console.error("addLicensedSeats:", error);
    try {
      await ensurePendingRenewalSchedule(input.orgId);
    } catch (restoreError) {
      console.error("restore pending schedule after add:", restoreError);
    }
    try {
      const latest = await loadOrgBilling(input.orgId);
      if (latest?.stripe_subscription_id) {
        const subscription = await getStripe().subscriptions.retrieve(
          latest.stripe_subscription_id,
          { expand: ["items.data.price", "latest_invoice"] },
        );
        const current = catalogFromSubscription(subscription, founding);
        if (
          current.catalog &&
          current.catalog.seatQuantity >= transition.currentSeats
        ) {
          try {
            await syncOrgFromSubscription(subscription, input.orgId);
          } catch (syncError) {
            console.error("addLicensedSeats recover sync:", syncError);
          }
          return {
            ok: true,
            currentSeats: transition.currentSeats,
            nextSeats: targetNextSeats,
            paymentUrl: pendingInvoiceUrl(subscription) ?? undefined,
          };
        }
      }
    } catch (recoverError) {
      console.error("addLicensedSeats recover:", recoverError);
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
    try {
      const targetSeats = Math.max(1, input.seatQuantity);
      const latest = await loadOrgBilling(input.orgId);
      if (
        latest?.billing_pending_seat_quantity === targetSeats ||
        latest?.stripe_subscription_schedule_id
      ) {
        return {
          ok: true,
          nextSeats: targetSeats,
          nextInterval,
        };
      }
      if (latest?.stripe_subscription_id) {
        const subscription = await getStripe().subscriptions.retrieve(
          latest.stripe_subscription_id,
          { expand: ["items.data.price"] },
        );
        const scheduleId = scheduleIdFromSubscription(subscription);
        if (scheduleId) {
          try {
            await savePendingBilling({
              orgId: input.orgId,
              seatQuantity: targetSeats,
              interval: nextInterval,
              effectiveAt: new Date(
                subscriptionPeriodEnd(subscription) * 1000,
              ).toISOString(),
              scheduleId,
            });
          } catch (syncError) {
            console.error("scheduleLicensedSeats recover save:", syncError);
          }
          return {
            ok: true,
            nextSeats: targetSeats,
            nextInterval,
          };
        }
      }
    } catch (recoverError) {
      console.error("scheduleLicensedSeats recover:", recoverError);
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
    const licensed = Math.max(1, billing.billing_seat_quantity ?? 1);
    const currentSeats = current.catalog?.seatQuantity ?? licensed;
    const revertingPendingInterval =
      Boolean(billing.billing_pending_interval) &&
      current.interval === input.interval;
    const targetSeats = revertingPendingInterval
      ? currentSeats
      : (billing.billing_pending_seat_quantity ?? currentSeats);
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
