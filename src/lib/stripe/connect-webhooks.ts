import "server-only";

import type Stripe from "stripe";

import {
  getStripeConnectionByAccountId,
} from "@/lib/payments/processor";
import { syncStripeConnectionFromAccount } from "@/lib/stripe/connect-accounts";
import { paymentIntentIdFromSession } from "@/lib/stripe/connect-checkout";
import {
  loadPaymentById,
  loadPaymentByStripeSessionId,
  markPaymentPaid,
} from "@/lib/square/payments";
import { createServiceClient } from "@/lib/supabase/admin";

async function paymentIdFromSession(session: Stripe.Checkout.Session) {
  const fromMeta = session.metadata?.payment_request_id?.trim();
  if (fromMeta) return fromMeta;
  const fromRef = session.client_reference_id?.trim();
  if (fromRef) return fromRef;
  const bySession = await loadPaymentByStripeSessionId(session.id);
  return bySession?.id ?? null;
}

export async function fulfillConnectedCheckoutSession(
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "payment") return;
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    return;
  }
  const paymentId = await paymentIdFromSession(session);
  if (!paymentId) return;
  const existing = await loadPaymentById(paymentId);
  if (!existing || existing.status === "paid") return;
  await markPaymentPaid({
    paymentId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentIdFromSession(session),
  });
}

export async function markConnectedCheckoutFailed(
  session: Stripe.Checkout.Session,
  status: "failed" | "expired",
) {
  if (session.mode !== "payment") return;
  const paymentId = await paymentIdFromSession(session);
  if (!paymentId) return;
  const payment = await loadPaymentById(paymentId);
  if (!payment || payment.status !== "pending") return;
  // A later Checkout Session may already be on the payment after a 24h
  // Stripe expiry; ignore stale events from the replaced session.
  if (
    payment.stripe_checkout_session_id &&
    payment.stripe_checkout_session_id !== session.id
  ) {
    return;
  }
  const windowEnds = payment.expires_at
    ? Date.parse(payment.expires_at)
    : Number.POSITIVE_INFINITY;
  // Checkout Sessions last at most 24h; payment links stay payable until
  // payment_requests.expires_at, including after a processor switch.
  if (windowEnds > Date.now()) return;

  const admin = createServiceClient();
  let query = admin
    .from("payment_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (payment.stripe_checkout_session_id) {
    query = query.eq("stripe_checkout_session_id", session.id);
  }
  await query;
}

export async function syncConnectedAccountFromEvent(
  accountId: string | undefined,
) {
  if (!accountId) return;
  const connection = await getStripeConnectionByAccountId(accountId);
  if (!connection) return;
  await syncStripeConnectionFromAccount(
    connection.organization_id,
    connection.stripe_account_id,
  );
}
