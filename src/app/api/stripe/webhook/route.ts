import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/client";
import {
  fulfillConnectedCheckoutSession,
  markConnectedCheckoutFailed,
  syncConnectedAccountFromEvent,
} from "@/lib/stripe/connect-webhooks";
import { trueUpLicensedSeatsForRenewal } from "@/lib/stripe/seats";
import { syncOrgFromSubscription } from "@/lib/stripe/sync";

export const runtime = "nodejs";

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

async function syncFromSubscriptionId(subscriptionId: string) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price", "discounts.source.coupon"],
  });
  await syncOrgFromSubscription(subscription);
}

async function constructStripeEvent(payload: string, signature: string) {
  const stripe = getStripe();
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        secret,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("invalid_signature");
}

export async function POST(request: Request) {
  if (
    !process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
    !process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()
  ) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await constructStripeEvent(payload, signature);
  } catch (error) {
    console.error(
      "stripe webhook verify:",
      error instanceof Error ? error.message : "invalid",
    );
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          await syncFromSubscriptionId(subscriptionId);
        }
        if (session.mode === "payment") {
          await fulfillConnectedCheckoutSession(session);
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        await fulfillConnectedCheckoutSession(event.data.object);
        break;
      }
      case "checkout.session.async_payment_failed": {
        await markConnectedCheckoutFailed(event.data.object, "failed");
        break;
      }
      case "checkout.session.expired": {
        await markConnectedCheckoutFailed(event.data.object, "expired");
        break;
      }
      case "account.updated": {
        const accountId =
          event.account ||
          (typeof event.data.object.id === "string"
            ? event.data.object.id
            : undefined);
        await syncConnectedAccountFromEvent(accountId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncFromSubscriptionId(event.data.object.id);
        break;
      }
      case "invoice.created": {
        const invoice = event.data.object;
        if (invoice.billing_reason !== "subscription_cycle") break;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          await trueUpLicensedSeatsForRenewal(subscriptionId);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subscriptionId = invoiceSubscriptionId(event.data.object);
        if (subscriptionId) await syncFromSubscriptionId(subscriptionId);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("stripe webhook:", error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
