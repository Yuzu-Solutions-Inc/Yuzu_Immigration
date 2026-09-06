import "server-only";

import type Stripe from "stripe";

import { env } from "@/lib/env";
import { deriveInvoiceStatus } from "@/lib/finance/invoice";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { paymentIntentIdFromSession } from "@/lib/stripe/connect-checkout";

export async function createInvoiceCheckoutUrl(input: {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  if (!stripeConfigured()) {
    throw new Error("stripe_not_configured");
  }
  const stripe = getStripe();
  const amountCents = Math.round(input.amount * 100);
  if (amountCents < 50) {
    throw new Error("amount_too_small");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail || undefined,
    client_reference_id: input.invoiceId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${input.invoiceNumber}`.slice(0, 250),
          },
        },
      },
    ],
    metadata: {
      source: "invoice",
      invoice_id: input.invoiceId,
      organization_id: input.organizationId,
    },
  });

  if (!session.url) throw new Error("stripe_checkout_url_missing");
  return { url: session.url, sessionId: session.id };
}

export async function fulfillInvoiceStripeCheckout(
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "payment") return false;
  if (session.metadata?.source !== "invoice") return false;
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    return false;
  }

  const invoiceId = session.metadata.invoice_id?.trim();
  const organizationId = session.metadata.organization_id?.trim();
  if (!invoiceId || !organizationId) return false;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("invoice stripe fulfill: missing SUPABASE_SERVICE_ROLE_KEY");
    return false;
  }

  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (existing) return true;

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("id, user_id, organization_id, total, status")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (invoiceError || !invoice) {
    console.error("invoice stripe fulfill: invoice missing", invoiceError?.message);
    return false;
  }

  const amount = (session.amount_total ?? 0) / 100;
  const paymentDate = new Date().toISOString().slice(0, 10);
  const { error: insertError } = await admin.from("payments").insert({
    organization_id: organizationId,
    user_id: invoice.user_id,
    invoice_id: invoiceId,
    payment_date: paymentDate,
    amount,
    method: "stripe",
    reference: session.id,
    notes: null,
    source: "stripe",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentIdFromSession(session),
  });
  if (insertError) {
    console.error("invoice stripe fulfill: insert", insertError.message);
    return false;
  }

  const { data: payments } = await admin
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId);
  const paid = (payments ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const status = deriveInvoiceStatus(Number(invoice.total), paid, invoice.status as string);
  await admin.from("invoices").update({ status }).eq("id", invoiceId);
  return true;
}
