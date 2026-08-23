"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  extraSeatsNeeded,
  type BillingInterval,
} from "@/lib/billing/plans";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  ensureBillingPrices,
  extraSeatLookupKey,
  planPriceLookupKey,
} from "@/lib/stripe/catalog";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  foundingCohortOpen,
  loadOrgBilling,
  parseSubscriptionItems,
  upsertStripeCustomerId,
} from "@/lib/stripe/sync";
import { createClient } from "@/lib/supabase/server";

export type BillingActionState = {
  error?: string;
};

const checkoutSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  plan: z.enum(["standard", "team"]),
  interval: z.enum(["month", "year"]),
  extraSeats: z.coerce.number().int().min(0).max(200),
});

async function requireBillingAdmin() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user || !canAdministerOrg(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  if (!stripeConfigured()) {
    return { ok: false as const, error: "not_configured" as const };
  }
  return { ok: true as const, membership, user };
}

async function memberCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return count ?? 0;
}

async function getOrCreateCustomer(orgId: string, email: string, name: string) {
  const billing = await loadOrgBilling(orgId);
  const stripe = getStripe();
  if (billing?.stripe_customer_id) {
    return billing.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { organization_id: orgId },
  });
  await upsertStripeCustomerId(orgId, customer.id);
  return customer.id;
}

function trialEndUnix(trialEndsAt: Date): number | undefined {
  const minMs = Date.now() + 60 * 60 * 1000;
  if (trialEndsAt.getTime() <= minMs) return undefined;
  return Math.floor(trialEndsAt.getTime() / 1000);
}

export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = checkoutSchema.safeParse({
    locale: formData.get("locale") || "en",
    plan: formData.get("plan"),
    interval: formData.get("interval"),
    extraSeats: formData.get("extraSeats") || "0",
  });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireBillingAdmin();
  if (!gate.ok) return { error: gate.error };
  const { membership, user } = gate;
  const orgId = membership.organization.id;
  const { locale, plan, interval } = parsed.data;

  const members = await memberCount(orgId);
  const extraSeats = Math.max(
    parsed.data.extraSeats,
    extraSeatsNeeded(plan, members),
  );

  const existing = await loadOrgBilling(orgId);
  if (existing?.stripe_subscription_id) {
    return updateSubscription({
      locale,
      plan,
      interval,
      extraSeats,
      orgId,
      userId: user.id,
    });
  }

  let founding: boolean;
  let extraSeatsForAudit = extraSeats;
  let sessionUrl: string | null | undefined;
  try {
    founding = await foundingCohortOpen(orgId);
    const prices = await ensureBillingPrices();
    const customerId = await getOrCreateCustomer(
      orgId,
      user.email ?? "",
      membership.organization.name,
    );

    const line_items: Array<{ price: string; quantity: number }> = [
      {
        price: prices[planPriceLookupKey(plan, interval, founding)],
        quantity: 1,
      },
    ];
    if (extraSeats > 0) {
      line_items.push({
        price: prices[extraSeatLookupKey(interval)],
        quantity: extraSeats,
      });
    }
    extraSeatsForAudit = extraSeats;

    const origin = await getAppBaseUrl();
    const inAppTrialActive =
      !membership.organization.subscribed &&
      membership.organization.trialEndsAt.getTime() > Date.now();
    const trialEnd = inAppTrialActive
      ? trialEndUnix(membership.organization.trialEndsAt)
      : undefined;

    const stripe = getStripe();
    const checkoutParams: Parameters<
      typeof stripe.checkout.sessions.create
    >[0] = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: orgId,
      success_url: `${origin}/${locale}/settings/billing?checkout=success`,
      cancel_url: `${origin}/${locale}/settings/billing?checkout=cancel`,
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      metadata: {
        organization_id: orgId,
        plan,
        interval,
        founding: founding ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          organization_id: orgId,
          plan,
          interval,
          founding: founding ? "true" : "false",
        },
        ...(inAppTrialActive && trialEnd ? { trial_end: trialEnd } : {}),
      },
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create(checkoutParams);
    } catch {
      const withoutTax = { ...checkoutParams };
      delete withoutTax.tax_id_collection;
      session = await stripe.checkout.sessions.create(withoutTax);
    }
    sessionUrl = session.url;
  } catch (error) {
    console.error("checkout session:", error);
    return { error: "checkout_failed" };
  }

  if (!sessionUrl) return { error: "checkout_failed" };

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user.id,
    actorKind: "staff",
    action: "billing.checkout.start",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { plan, interval, extraSeats: extraSeatsForAudit, founding },
  });

  redirect(sessionUrl);
}

async function updateSubscription(input: {
  locale: string;
  plan: PricingPlanId;
  interval: BillingInterval;
  extraSeats: number;
  orgId: string;
  userId: string;
}): Promise<BillingActionState> {
  const billing = await loadOrgBilling(input.orgId);
  if (!billing?.stripe_subscription_id) return { error: "not_found" };

  const founding =
    Boolean(billing.founding_rate) || (await foundingCohortOpen(input.orgId));
  const prices = await ensureBillingPrices();
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    billing.stripe_subscription_id,
    { expand: ["items.data.price"] },
  );

  const parsed = parseSubscriptionItems(subscription);
  const planPriceId = prices[planPriceLookupKey(input.plan, input.interval, founding)];
  const extraPriceId = prices[extraSeatLookupKey(input.interval)];

  const items: Array<{
    id?: string;
    price?: string;
    quantity?: number;
    deleted?: boolean;
  }> = [];

  let planItemId: string | undefined;
  let extraItemId: string | undefined;
  for (const item of subscription.items.data) {
    const key = item.price.lookup_key ?? "";
    if (key.startsWith("extra_seat")) extraItemId = item.id;
    else if (key.startsWith("standard_") || key.startsWith("team_")) {
      planItemId = item.id;
    }
  }

  items.push({
    id: planItemId,
    price: planPriceId,
    quantity: 1,
  });

  if (input.extraSeats > 0) {
    items.push({
      id: extraItemId,
      price: extraPriceId,
      quantity: input.extraSeats,
    });
  } else if (extraItemId) {
    items.push({ id: extraItemId, deleted: true });
  }

  try {
    await stripe.subscriptions.update(subscription.id, {
      items,
      proration_behavior: "create_prorations",
      metadata: {
        organization_id: input.orgId,
        plan: input.plan,
        interval: input.interval,
        founding: founding ? "true" : "false",
      },
    });
  } catch (error) {
    console.error("update subscription:", error);
    return { error: "update_failed" };
  }

  await recordAuditEvent({
    organizationId: input.orgId,
    actorUserId: input.userId,
    actorKind: "staff",
    action: "billing.subscription.update",
    resourceType: "organization",
    resourceId: input.orgId,
    metadata: {
      plan: input.plan,
      interval: input.interval,
      extraSeats: input.extraSeats,
      fromPlan: parsed.plan,
    },
  });

  revalidatePath(`/${input.locale}/settings/billing`);
  revalidatePath(`/${input.locale}/home`);
  return {};
}

export async function openBillingPortalAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const locale = String(formData.get("locale") || "en");
  const gate = await requireBillingAdmin();
  if (!gate.ok) return { error: gate.error };

  const billing = await loadOrgBilling(gate.membership.organization.id);
  if (!billing?.stripe_customer_id) return { error: "not_found" };

  const origin = await getAppBaseUrl();
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
    return_url: `${origin}/${locale}/settings/billing`,
  });

  redirect(session.url);
}
