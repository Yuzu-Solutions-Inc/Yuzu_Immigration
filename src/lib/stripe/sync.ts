import "server-only";

import type Stripe from "stripe";

import { type PricingPlanId, PRICING } from "@/lib/marketing/pricing";
import {
  includedSeats,
  LEGACY_TEAM_INCLUDED_SEATS,
  totalPaidSeats,
  type BillingInterval,
} from "@/lib/billing/plans";
import { pendingCatalogApplied } from "@/lib/billing/transitions";
import {
  isFoundingCouponId,
  isLegacyForeverFoundingCouponId,
  parseLookupKey,
  remainingFoundingPromoMonths,
} from "@/lib/stripe/catalog";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);
const DAY_MS = 86_400_000;

export type OrgBillingRow = {
  id: string;
  subscribed_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_plan: string | null;
  billing_interval: string | null;
  billing_seat_quantity: number | null;
  billing_seat_true_up: boolean | null;
  billing_pending_seat_quantity: number | null;
  billing_pending_interval: string | null;
  billing_pending_effective_at: string | null;
  stripe_subscription_schedule_id: string | null;
  founding_rate: boolean | null;
};

export function subscriptionEntitlesAccess(status: Stripe.Subscription.Status) {
  return ENTITLED_STATUSES.has(status);
}

export function periodEndIso(subscription: Stripe.Subscription): string | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  const end = ends.length ? Math.max(...ends) : null;
  if (end === null) return null;
  return new Date(end * 1000).toISOString();
}

export function parseSubscriptionItems(subscription: Stripe.Subscription): {
  plan: PricingPlanId | null;
  interval: BillingInterval | null;
  founding: boolean;
  extraSeats: number;
  seatQuantity: number;
} {
  let plan: PricingPlanId | null = null;
  let interval: BillingInterval | null = null;
  let founding = false;
  let extraSeats = 0;

  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price || typeof price === "string") continue;
    const parsed = parseLookupKey(price.lookup_key);
    if (!parsed) continue;
    if (parsed.plan === "extra_seat") {
      extraSeats += item.quantity ?? 0;
      interval = parsed.interval;
      if (parsed.founding) founding = true;
      continue;
    }
    if (parsed.plan === "team") {
      extraSeats += LEGACY_TEAM_INCLUDED_SEATS - 1;
      plan = "standard";
      interval = parsed.interval;
      founding = parsed.founding || founding;
      continue;
    }
    plan = "standard";
    interval = parsed.interval;
    founding = parsed.founding || founding;
  }

  const seatQuantity = plan ? totalPaidSeats(plan, extraSeats) : extraSeats;
  return { plan, interval, founding, extraSeats, seatQuantity };
}

export function subscriptionHasFoundingPromo(
  subscription: Stripe.Subscription,
): boolean {
  for (const id of foundingCouponIdsOnSubscription(subscription)) {
    if (isFoundingCouponId(id)) return true;
  }
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === "string") continue;
    const coupon = entry.source?.coupon;
    if (typeof coupon === "object" && coupon?.metadata?.founding === "true") {
      return true;
    }
  }
  return false;
}

export function subscriptionHasLegacyForeverFoundingPromo(
  subscription: Stripe.Subscription,
): boolean {
  return foundingCouponIdsOnSubscription(subscription).some(
    isLegacyForeverFoundingCouponId,
  );
}

function foundingCouponIdsOnSubscription(
  subscription: Stripe.Subscription,
): string[] {
  const ids: string[] = [];
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === "string") continue;
    const coupon = entry.source?.coupon;
    const id = typeof coupon === "string" ? coupon : coupon?.id;
    if (id) ids.push(id);
  }
  return ids;
}

export function extraSeatsUseFoundingPrice(
  subscription: Stripe.Subscription,
): boolean {
  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price || typeof price === "string") continue;
    const parsed = parseLookupKey(price.lookup_key);
    if (parsed?.plan === "extra_seat" && parsed.founding) return true;
  }
  return false;
}

export function firstSeatUsesFoundingPrice(
  subscription: Stripe.Subscription,
): boolean {
  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price || typeof price === "string") continue;
    const parsed = parseLookupKey(price.lookup_key);
    if (parsed && parsed.plan !== "extra_seat" && parsed.founding) return true;
  }
  return false;
}

export function subscriptionHasExtraSeats(
  subscription: Stripe.Subscription,
): boolean {
  for (const item of subscription.items.data) {
    const price = item.price;
    if (!price || typeof price === "string") continue;
    const parsed = parseLookupKey(price.lookup_key);
    if (parsed?.plan === "extra_seat" && (item.quantity ?? 0) > 0) return true;
  }
  return false;
}

export type FoundingPromoDecision = {
  apply: boolean;
  forever: boolean;
  months: number;
};

function isFoundingCoupon(
  coupon: Stripe.Coupon | string | null | undefined,
): boolean {
  const id = typeof coupon === "string" ? coupon : coupon?.id;
  if (isFoundingCouponId(id)) return true;
  return typeof coupon === "object" && coupon?.metadata?.founding === "true";
}

function isForeverFoundingCoupon(
  coupon: Stripe.Coupon | string | null | undefined,
): boolean {
  const id = typeof coupon === "string" ? coupon : coupon?.id;
  if (isLegacyForeverFoundingCouponId(id)) return true;
  return typeof coupon === "object" && coupon?.duration === "forever";
}

/**
 * First 12 months of founding rates, remaining time on resubscribe, or
 * grandfathered forever coupons. Returns apply:false after the window ends.
 */
export async function foundingPromoDecisionForCustomer(
  customerId: string,
): Promise<FoundingPromoDecision> {
  const stripe = getStripe();
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.discounts.source.coupon"],
  });

  let forever = false;
  let sawRepeating = false;
  let latestEnd: number | null = null;
  const now = Math.floor(Date.now() / 1000);

  for (const subscription of list.data) {
    if (subscriptionHasLegacyForeverFoundingPromo(subscription)) {
      forever = true;
    }
    for (const entry of subscription.discounts ?? []) {
      if (typeof entry === "string") continue;
      const coupon = entry.source?.coupon;
      if (!isFoundingCoupon(coupon)) continue;
      if (isForeverFoundingCoupon(coupon)) {
        forever = true;
        continue;
      }
      sawRepeating = true;
      const end = typeof entry.end === "number" ? entry.end : null;
      if (end && (latestEnd === null || end > latestEnd)) latestEnd = end;
    }
  }

  if (forever) {
    return { apply: true, forever: true, months: PRICING.promoMonths };
  }
  const remaining = remainingFoundingPromoMonths(latestEnd, now);
  if (remaining > 0) {
    return { apply: true, forever: false, months: remaining };
  }
  if (sawRepeating) {
    return { apply: false, forever: false, months: 0 };
  }
  return { apply: true, forever: false, months: PRICING.promoMonths };
}

export function remainingFoundingPromoMonthsOnSubscription(
  subscription: Stripe.Subscription,
  nowUnix = Math.floor(Date.now() / 1000),
): number {
  let latestEnd: number | null = null;
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === "string") continue;
    const coupon = entry.source?.coupon;
    if (!isFoundingCoupon(coupon)) continue;
    if (isForeverFoundingCoupon(coupon)) return PRICING.promoMonths;
    const end = typeof entry.end === "number" ? entry.end : null;
    if (end && (latestEnd === null || end > latestEnd)) latestEnd = end;
  }
  return remainingFoundingPromoMonths(latestEnd, nowUnix);
}

export async function foundingRatesApplyAtCheckout(
  orgId: string,
): Promise<boolean> {
  if (!(await foundingCohortOpen(orgId))) return false;
  const billing = await loadOrgBilling(orgId);
  if (!billing?.stripe_customer_id) return true;
  const decision = await foundingPromoDecisionForCustomer(
    billing.stripe_customer_id,
  );
  return decision.apply;
}

export async function foundingCohortOpen(orgId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: self } = await admin
    .from("organizations")
    .select("founding_rate")
    .eq("id", orgId)
    .maybeSingle();
  return Boolean(self?.founding_rate);
}

export async function loadOrgBilling(orgId: string): Promise<OrgBillingRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select(
      "id, subscribed_at, stripe_customer_id, stripe_subscription_id, billing_plan, billing_interval, billing_seat_quantity, billing_seat_true_up, billing_pending_seat_quantity, billing_pending_interval, billing_pending_effective_at, stripe_subscription_schedule_id, founding_rate",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    console.error("loadOrgBilling:", error.message);
    return null;
  }
  return data as OrgBillingRow | null;
}

export async function savePendingBilling(input: {
  orgId: string;
  seatQuantity: number | null;
  interval: BillingInterval | null;
  effectiveAt: string | null;
  scheduleId: string | null;
}) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("organizations")
    .update({
      billing_pending_seat_quantity: input.seatQuantity,
      billing_pending_interval: input.interval,
      billing_pending_effective_at: input.effectiveAt,
      stripe_subscription_schedule_id: input.scheduleId,
      billing_seat_true_up: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orgId);
  if (error) {
    console.error("savePendingBilling:", error.message);
    throw new Error("pending_billing_save_failed");
  }
}

export async function applyPendingLicenses(orgId: string) {
  const admin = createServiceClient();
  const { error } = await admin.rpc("apply_org_renewal_licenses", {
    p_organization_id: orgId,
  });
  if (error) {
    console.error("applyPendingLicenses:", error.message);
    throw new Error("pending_license_apply_failed");
  }
}

export async function clearPendingLicenses(orgId: string) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("organization_members")
    .update({ licensed_at_renewal: null })
    .eq("organization_id", orgId);
  if (error) {
    console.error("clearPendingLicenses:", error.message);
    throw new Error("pending_license_clear_failed");
  }
}

export async function clearPendingBillingForSchedule(
  orgId: string,
  scheduleId: string,
) {
  const billing = await loadOrgBilling(orgId);
  if (billing?.stripe_subscription_schedule_id !== scheduleId) return;
  await clearPendingLicenses(orgId);
  await savePendingBilling({
    orgId,
    seatQuantity: null,
    interval: null,
    effectiveAt: null,
    scheduleId: null,
  });
}

/**
 * Drop paid entitlement and expire the in-app trial so the workspace is
 * read-only until checkout succeeds again. Keeps stripe_customer_id and
 * founding_rate for a clean resubscribe.
 */
export async function lockOrgAfterUnsubscribe(orgId: string) {
  const admin = createServiceClient();
  const expiredTrialStart = new Date(
    Date.now() - (PRICING.trialDays + 1) * DAY_MS,
  ).toISOString();
  const { error } = await admin
    .from("organizations")
    .update({
      subscribed_at: null,
      stripe_subscription_id: null,
      stripe_subscription_schedule_id: null,
      billing_plan: null,
      billing_interval: null,
      billing_seat_quantity: 1,
      billing_seat_true_up: false,
      billing_pending_seat_quantity: null,
      billing_pending_interval: null,
      billing_pending_effective_at: null,
      trial_started_at: expiredTrialStart,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (error) {
    console.error("lockOrgAfterUnsubscribe:", error.message);
    throw new Error("unsubscribe_lock_failed");
  }
  await clearPendingLicenses(orgId);
}

export async function upsertStripeCustomerId(
  orgId: string,
  customerId: string,
) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);
  if (error) {
    console.error("upsertStripeCustomerId:", error.message);
    throw new Error("customer_save_failed");
  }
}

export async function findOrgIdForCustomer(
  customerId: string,
): Promise<string | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    console.error("findOrgIdForCustomer:", error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

export async function syncOrgFromSubscription(
  subscription: Stripe.Subscription,
  orgIdHint?: string | null,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const orgId =
    orgIdHint ||
    subscription.metadata.organization_id ||
    (await findOrgIdForCustomer(customerId));
  if (!orgId) {
    console.error("syncOrgFromSubscription: missing org", subscription.id);
    return;
  }

  const entitled = subscriptionEntitlesAccess(subscription.status);
  if (!entitled) {
    await lockOrgAfterUnsubscribe(orgId);
    try {
      await upsertStripeCustomerId(orgId, customerId);
    } catch (error) {
      console.error("syncOrgFromSubscription customer:", error);
    }
    return;
  }

  const parsed = parseSubscriptionItems(subscription);
  const admin = createServiceClient();
  const { data: current } = await admin
    .from("organizations")
    .select("subscribed_at, founding_rate")
    .eq("id", orgId)
    .maybeSingle();

  const founding =
    Boolean(current?.founding_rate) ||
    parsed.founding ||
    subscriptionHasFoundingPromo(subscription);

  const { error } = await admin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      billing_plan: parsed.plan,
      billing_interval: parsed.interval,
      billing_seat_quantity: parsed.plan
        ? parsed.seatQuantity
        : includedSeats("standard"),
      founding_rate: founding,
      subscribed_at:
        (current?.subscribed_at as string | null) ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    console.error("syncOrgFromSubscription:", error.message);
    throw new Error("sync_failed");
  }
}

/**
 * Apply staged member access once Stripe reports the scheduled catalog as the
 * active subscription catalog. Safe to call repeatedly from webhook events.
 */
export async function finalizePendingBillingIfApplied(
  subscription: Stripe.Subscription,
  orgIdHint?: string | null,
): Promise<boolean> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const orgId =
    orgIdHint ||
    subscription.metadata.organization_id ||
    (await findOrgIdForCustomer(customerId));
  if (!orgId) return false;

  const billing = await loadOrgBilling(orgId);
  if (
    !billing?.billing_pending_seat_quantity ||
    !billing.billing_pending_interval
  ) {
    return false;
  }

  const parsed = parseSubscriptionItems(subscription);
  if (
    !pendingCatalogApplied({
      activeSeats: parsed.seatQuantity,
      activeInterval: parsed.interval,
      pendingSeats: billing.billing_pending_seat_quantity,
      pendingInterval:
        billing.billing_pending_interval === "year" ||
        billing.billing_pending_interval === "month"
          ? billing.billing_pending_interval
          : null,
    })
  ) {
    return false;
  }

  await applyPendingLicenses(orgId);
  await savePendingBilling({
    orgId,
    seatQuantity: null,
    interval: null,
    effectiveAt: null,
    scheduleId: null,
  });
  return true;
}

export async function reconcileOrgBilling(orgId: string) {
  const billing = await loadOrgBilling(orgId);
  if (!billing?.stripe_customer_id) return;

  const stripe = getStripe();
  const list = await stripe.subscriptions.list({
    customer: billing.stripe_customer_id,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price", "data.discounts.source.coupon"],
  });
  const preferred =
    list.data.find((row) => subscriptionEntitlesAccess(row.status)) ??
    list.data[0];
  if (!preferred) return;
  await syncOrgFromSubscription(preferred, orgId);
}
