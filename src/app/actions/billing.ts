"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { occupancyCount } from "@/lib/billing/occupancy";
import {
  catalogForOccupancy,
  MAX_SEAT_ADD,
  type BillingInterval,
} from "@/lib/billing/plans";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  ensureBillingPrices,
  extraSeatLookupKey,
  foundingDiscountForCustomer,
  planPriceLookupKey,
} from "@/lib/stripe/catalog";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import {
  ensureLicensedSeats,
  setOrgSeatTrueUp,
  updateSubscriptionCatalog,
} from "@/lib/stripe/seats";
import {
  foundingCohortOpen,
  loadOrgBilling,
  upsertStripeCustomerId,
} from "@/lib/stripe/sync";

export type BillingActionState = {
  error?: string;
};

const checkoutSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  interval: z.enum(["month", "year"]),
});

function checkoutIntegrationId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % 26]).join("");
  return `permitos_billing_${suffix}`;
}

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
    interval: formData.get("interval"),
  });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireBillingAdmin();
  if (!gate.ok) return { error: gate.error };
  const { membership, user } = gate;
  const orgId = membership.organization.id;
  const { locale, interval } = parsed.data;

  const occupancy = await occupancyCount(orgId);
  const existing = await loadOrgBilling(orgId);
  if (existing?.stripe_subscription_id) {
    return updateSubscription({
      locale,
      interval,
      occupancy,
      orgId,
      userId: user.id,
    });
  }

  let founding: boolean;
  let catalog = catalogForOccupancy(occupancy, false);
  let sessionUrl: string | null | undefined;
  try {
    founding = await foundingCohortOpen(orgId);
    catalog = catalogForOccupancy(occupancy, founding);
    const prices = await ensureBillingPrices();
    const customerId = await getOrCreateCustomer(
      orgId,
      user.email ?? "",
      membership.organization.name,
    );

    const line_items: Array<{ price: string; quantity: number }> = [
      {
        price: prices[planPriceLookupKey(catalog.plan, interval)],
        quantity: 1,
      },
    ];
    if (catalog.extraSeats > 0) {
      line_items.push({
        price: prices[extraSeatLookupKey(interval)],
        quantity: catalog.extraSeats,
      });
    }

    const origin = await getAppBaseUrl();
    const inAppTrialActive =
      !membership.organization.subscribed &&
      membership.organization.trialEndsAt.getTime() > Date.now();
    const trialEnd = inAppTrialActive
      ? trialEndUnix(membership.organization.trialEndsAt)
      : undefined;

    const stripe = getStripe();
    const foundingDiscount = founding
      ? await foundingDiscountForCustomer(customerId, catalog.plan, interval)
      : null;
    const checkoutParams: Parameters<
      typeof stripe.checkout.sessions.create
    >[0] = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: orgId,
      integration_identifier: checkoutIntegrationId(),
      success_url: `${origin}/${locale}/settings/billing?checkout=success`,
      cancel_url: `${origin}/${locale}/settings/billing?checkout=cancel`,
      line_items,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      metadata: {
        organization_id: orgId,
        plan: catalog.plan,
        interval,
        founding: founding ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          organization_id: orgId,
          plan: catalog.plan,
          interval,
          founding: founding ? "true" : "false",
        },
        ...(inAppTrialActive && trialEnd ? { trial_end: trialEnd } : {}),
      },
      ...(foundingDiscount ? { discounts: [foundingDiscount] } : {}),
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
    metadata: {
      plan: catalog.plan,
      interval,
      extraSeats: catalog.extraSeats,
      founding,
    },
  });

  redirect(sessionUrl);
}

async function updateSubscription(input: {
  locale: string;
  interval: BillingInterval;
  occupancy: number;
  orgId: string;
  userId: string;
}): Promise<BillingActionState> {
  const result = await updateSubscriptionCatalog({
    orgId: input.orgId,
    interval: input.interval,
    occupancy: input.occupancy,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "seat_charge_failed"
          ? "update_failed"
          : result.error,
    };
  }

  await recordAuditEvent({
    organizationId: input.orgId,
    actorUserId: input.userId,
    actorKind: "staff",
    action: "billing.subscription.update",
    resourceType: "organization",
    resourceId: input.orgId,
    metadata: {
      plan: result.catalog.plan,
      interval: input.interval,
      extraSeats: result.catalog.extraSeats,
      fromPlan: result.fromPlan,
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

export async function addLicensedSeatAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      quantity: z.coerce.number().int().min(1).max(MAX_SEAT_ADD),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      quantity: formData.get("quantity") || "1",
    });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireBillingAdmin();
  if (!gate.ok) return { error: gate.error };

  const orgId = gate.membership.organization.id;
  const occupancy = await occupancyCount(orgId);
  const billing = await loadOrgBilling(orgId);
  const licensed = billing?.billing_seat_quantity ?? 1;
  const result = await ensureLicensedSeats({
    orgId,
    occupancy: Math.max(occupancy, licensed) + parsed.data.quantity,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "seat_charge_failed" ? "update_failed" : result.error,
    };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: gate.user.id,
    actorKind: "staff",
    action: "billing.seat.add",
    resourceType: "organization",
    resourceId: orgId,
    metadata: {
      occupancy,
      licensed,
      added: parsed.data.quantity,
    },
  });

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return {};
}

export async function setSeatTrueUpAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      enabled: z.enum(["true", "false"]),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      enabled: formData.get("enabled"),
    });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireBillingAdmin();
  if (!gate.ok) return { error: gate.error };

  const orgId = gate.membership.organization.id;
  const enabled = parsed.data.enabled === "true";
  try {
    await setOrgSeatTrueUp(orgId, enabled);
  } catch {
    return { error: "update_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: gate.user.id,
    actorKind: "staff",
    action: enabled ? "billing.seat.true_up.on" : "billing.seat.true_up.off",
    resourceType: "organization",
    resourceId: orgId,
  });

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return {};
}
