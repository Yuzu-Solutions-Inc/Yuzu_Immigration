import "server-only";

import type Stripe from "stripe";

import { PRICING, type PricingPlanId } from "@/lib/marketing/pricing";
import {
  includedSeats,
  totalPaidSeats,
  type BillingInterval,
} from "@/lib/billing/plans";
import { parseLookupKey } from "@/lib/stripe/catalog";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/admin";

const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

type OrgBillingRow = {
  id: string;
  subscribed_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_plan: string | null;
  billing_interval: string | null;
  billing_seat_quantity: number | null;
  founding_rate: boolean | null;
};

export function subscriptionEntitlesAccess(status: Stripe.Subscription.Status) {
  return ENTITLED_STATUSES.has(status);
}

export function periodEndIso(subscription: Stripe.Subscription): string | null {
  const end = subscription.items.data[0]?.current_period_end;
  if (!end) return null;
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
    const parsed = parseLookupKey(item.price.lookup_key);
    if (!parsed) continue;
    if (parsed.plan === "extra_seat") {
      extraSeats += item.quantity ?? 0;
      interval = parsed.interval;
      continue;
    }
    plan = parsed.plan;
    interval = parsed.interval;
    founding = parsed.founding;
  }

  const seatQuantity = plan ? totalPaidSeats(plan, extraSeats) : extraSeats;
  return { plan, interval, founding, extraSeats, seatQuantity };
}

export async function foundingCohortOpen(orgId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: self } = await admin
    .from("organizations")
    .select("founding_rate")
    .eq("id", orgId)
    .maybeSingle();
  if (self?.founding_rate) return true;

  const { count, error } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("founding_rate", true);
  if (error) {
    console.error("founding cohort:", error.message);
    return false;
  }
  return (count ?? 0) < PRICING.foundingCohortSize;
}

export async function loadOrgBilling(orgId: string): Promise<OrgBillingRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select(
      "id, subscribed_at, stripe_customer_id, stripe_subscription_id, billing_plan, billing_interval, billing_seat_quantity, founding_rate",
    )
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    console.error("loadOrgBilling:", error.message);
    return null;
  }
  return data as OrgBillingRow | null;
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

  const parsed = parseSubscriptionItems(subscription);
  const entitled = subscriptionEntitlesAccess(subscription.status);
  const admin = createServiceClient();
  const { data: current } = await admin
    .from("organizations")
    .select("subscribed_at, founding_rate")
    .eq("id", orgId)
    .maybeSingle();

  const founding =
    parsed.founding ||
    subscription.metadata.founding === "true" ||
    Boolean(current?.founding_rate);

  const { error } = await admin
    .from("organizations")
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: entitled ? subscription.id : null,
      billing_plan: parsed.plan,
      billing_interval: parsed.interval,
      billing_seat_quantity: parsed.plan
        ? parsed.seatQuantity
        : includedSeats("standard"),
      founding_rate: founding,
      subscribed_at: entitled
        ? (current?.subscribed_at as string | null) ?? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    console.error("syncOrgFromSubscription:", error.message);
    throw new Error("sync_failed");
  }
}

export async function reconcileOrgBilling(orgId: string) {
  const billing = await loadOrgBilling(orgId);
  if (!billing?.stripe_customer_id) return;

  const stripe = getStripe();
  const list = await stripe.subscriptions.list({
    customer: billing.stripe_customer_id,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price"],
  });
  const preferred =
    list.data.find((row) => subscriptionEntitlesAccess(row.status)) ??
    list.data[0];
  if (!preferred) return;
  await syncOrgFromSubscription(preferred, orgId);
}
