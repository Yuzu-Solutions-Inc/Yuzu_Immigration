import "server-only";

import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe/client";
import { payCheckoutIntegrationId } from "@/lib/stripe/connect-accounts";

const STRIPE_CHECKOUT_MIN_MS = 31 * 60 * 1000;
const STRIPE_CHECKOUT_MAX_MS = 24 * 60 * 60 * 1000;

function sessionExpiresUnix(expiresAt?: Date | null) {
  const now = Date.now();
  const max = now + STRIPE_CHECKOUT_MAX_MS;
  const min = now + STRIPE_CHECKOUT_MIN_MS;
  const wanted = expiresAt?.getTime() ?? max;
  return Math.floor(Math.min(max, Math.max(min, wanted)) / 1000);
}

export async function createConnectedCheckoutSession(input: {
  stripeAccountId: string;
  amountCents: number;
  taxCents?: number;
  taxLabel?: string | null;
  currency: string;
  name: string;
  paymentRequestId: string;
  successUrl: string;
  cancelUrl: string;
  buyerEmail?: string | null;
  expiresAt?: Date | null;
}): Promise<{ sessionId: string; checkoutUrl: string }> {
  const stripe = getStripe();
  const currency = input.currency.toLowerCase();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency,
        unit_amount: input.amountCents,
        product_data: { name: input.name.slice(0, 250) },
      },
    },
  ];
  if ((input.taxCents ?? 0) > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: input.taxCents,
        product_data: {
          name: (input.taxLabel || "Tax").slice(0, 250),
        },
      },
    });
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: lineItems,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.buyerEmail || undefined,
      client_reference_id: input.paymentRequestId,
      integration_identifier: payCheckoutIntegrationId(),
      expires_at: sessionExpiresUnix(input.expiresAt),
      metadata: {
        payment_request_id: input.paymentRequestId,
        processor: "stripe",
      },
    },
    { stripeAccount: input.stripeAccountId },
  );

  if (!session.url) throw new Error("stripe_checkout_url_missing");
  return { sessionId: session.id, checkoutUrl: session.url };
}

export async function ensureConnectedCheckoutSession(input: {
  stripeAccountId: string;
  sessionId?: string | null;
  checkoutUrl?: string | null;
  amountCents: number;
  taxCents?: number;
  taxLabel?: string | null;
  currency: string;
  name: string;
  paymentRequestId: string;
  successUrl: string;
  cancelUrl: string;
  buyerEmail?: string | null;
  expiresAt?: Date | null;
}): Promise<{ sessionId: string; checkoutUrl: string; reused: boolean }> {
  const stripe = getStripe();
  if (input.sessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(
        input.sessionId,
        {},
        { stripeAccount: input.stripeAccountId },
      );
      if (existing.status === "open" && existing.url) {
        return {
          sessionId: existing.id,
          checkoutUrl: existing.url,
          reused: true,
        };
      }
      if (existing.status === "complete") {
        return {
          sessionId: existing.id,
          checkoutUrl: existing.url || input.checkoutUrl || input.successUrl,
          reused: true,
        };
      }
    } catch (error) {
      console.error("retrieve connected checkout session:", error);
    }
  }

  const created = await createConnectedCheckoutSession(input);
  return { ...created, reused: false };
}

export async function refundConnectedCharge(input: {
  stripeAccountId: string;
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{ refundId: string }> {
  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountCents,
    },
    {
      stripeAccount: input.stripeAccountId,
      idempotencyKey: input.idempotencyKey,
    },
  );
  return { refundId: refund.id };
}

export function paymentIntentIdFromSession(
  session: Stripe.Checkout.Session,
): string | null {
  const intent = session.payment_intent;
  if (!intent) return null;
  return typeof intent === "string" ? intent : intent.id;
}
