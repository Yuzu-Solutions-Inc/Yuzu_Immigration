import { after } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { serviceTitle } from "@/lib/booking/service-i18n";

import {
  computeCancelRefundAmounts,
  normalizeSquareCancelRefundPolicy,
} from "./cancel-policy";
import { getActiveCheckoutProcessor } from "@/lib/payments/processor";
import {
  ensureConnectedCheckoutSession,
  refundConnectedCharge,
} from "@/lib/stripe/connect-checkout";

import {
  createSquarePaymentLink,
  findSquarePaymentIdByOrderId,
  getOrgSquareConnectionRecord,
  refundSquarePayment,
} from "./client";

export const PAYMENT_TOKEN_AAD = "payment_requests.token_encrypted";
export const MANAGE_TOKEN_AAD = "booking_appointments.manage_token_encrypted";

export type PaymentRequestRow = {
  id: string;
  organization_id: string;
  source: "booking" | "project";
  status: string;
  amount_cents: number;
  tax_cents: number;
  tax_percent: number | string | null;
  tax_label: string | null;
  tax_country: string | null;
  tax_region: string | null;
  sage_tax_rate_id: string | null;
  sage_invoice_id: string | null;
  currency: string;
  description: string;
  project_id: string | null;
  person_id: string | null;
  appointment_id: string | null;
  processor: "square" | "stripe";
  checkout_url: string | null;
  square_order_id: string | null;
  square_payment_id: string | null;
  square_refund_id: string | null;
  stripe_account_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
  expires_at: string | null;
};

export async function createCheckoutPaymentRequest(input: {
  organizationId: string;
  source: "booking" | "project";
  amountCents: number;
  currency: string;
  description: string;
  /** Locale segment for /{locale}/pay/{token} return URL. */
  locale: string;
  projectId?: string | null;
  personId?: string | null;
  appointmentId?: string | null;
  createdBy?: string | null;
  buyerEmail?: string | null;
  expiresInHours?: number;
  /** Absolute expiry (wins over expiresInHours when set). */
  expiresAt?: Date | null;
}): Promise<{ payment: PaymentRequestRow; token: string; checkoutUrl: string }> {
  const processor = await getActiveCheckoutProcessor(input.organizationId);
  if (!processor) throw new Error("processor_not_connected");

  const token = createBookingToken();
  const tokenHash = hashBookingToken(token);
  const origin = await getAppBaseUrl();
  const redirectUrl = `${origin.replace(/\/$/, "")}/${input.locale}/pay/${token}`;

  const admin = createServiceClient();
  const expiresAt = (
    input.expiresAt ??
    new Date(Date.now() + (input.expiresInHours ?? 72) * 3_600_000)
  ).toISOString();

  const dek = await getOrgDataKey(input.organizationId);
  const { getOrgSageConnection } = await import("@/lib/sage/client");
  const sageConnection = await getOrgSageConnection(input.organizationId);
  const deferProcessorCheckout = Boolean(sageConnection);

  const { data: payment, error } = await admin
    .from("payment_requests")
    .insert({
      organization_id: input.organizationId,
      source: input.source,
      status: "pending",
      amount_cents: input.amountCents,
      currency: input.currency.toUpperCase(),
      description: input.description,
      project_id: input.projectId ?? null,
      person_id: input.personId ?? null,
      appointment_id: input.appointmentId ?? null,
      created_by: input.createdBy ?? null,
      processor: processor.processor,
      stripe_account_id:
        processor.processor === "stripe"
          ? processor.stripe.stripe_account_id
          : null,
      token_hash: tokenHash,
      token_encrypted: encryptField(token, PAYMENT_TOKEN_AAD, dek),
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !payment) {
    console.error("create payment request:", error?.message);
    throw new Error("payment_create_failed");
  }

  if (deferProcessorCheckout) {
    return {
      payment: payment as PaymentRequestRow,
      token,
      checkoutUrl: redirectUrl,
    };
  }

  try {
    const attached = await attachProcessorCheckout({
      payment: payment as PaymentRequestRow,
      token,
      locale: input.locale,
      buyerEmail: input.buyerEmail,
    });
    return {
      payment: attached,
      token,
      checkoutUrl: attached.checkout_url || redirectUrl,
    };
  } catch (err) {
    await admin
      .from("payment_requests")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    throw err;
  }
}

export async function attachProcessorCheckout(input: {
  payment: PaymentRequestRow;
  token: string;
  locale: string;
  buyerEmail?: string | null;
  tax?: {
    taxCents: number;
    taxPercent: number;
    taxLabel: string;
    country: string;
    region: string | null;
    sageTaxRateId: string | null;
  } | null;
}): Promise<PaymentRequestRow> {
  const origin = await getAppBaseUrl();
  const redirectUrl = `${origin.replace(/\/$/, "")}/${input.locale}/pay/${input.token}`;
  const processor = input.payment.processor || "square";
  const taxCents = input.tax?.taxCents ?? input.payment.tax_cents ?? 0;
  const admin = createServiceClient();
  const taxPatch = input.tax
    ? {
        tax_cents: input.tax.taxCents,
        tax_percent: input.tax.taxPercent,
        tax_label: input.tax.taxLabel,
        tax_country: input.tax.country,
        tax_region: input.tax.region,
        sage_tax_rate_id: input.tax.sageTaxRateId,
      }
    : {};

  if (processor === "stripe") {
    const stripeAccountId = input.payment.stripe_account_id;
    if (!stripeAccountId) throw new Error("stripe_account_missing");
    const session = await ensureConnectedCheckoutSession({
      stripeAccountId,
      sessionId:
        input.tax && input.payment.tax_cents !== taxCents
          ? null
          : input.payment.stripe_checkout_session_id,
      checkoutUrl: input.payment.checkout_url,
      amountCents: input.payment.amount_cents,
      taxCents,
      taxLabel: input.tax?.taxLabel ?? input.payment.tax_label,
      currency: input.payment.currency,
      name: input.payment.description,
      paymentRequestId: input.payment.id,
      successUrl: redirectUrl,
      cancelUrl: redirectUrl,
      buyerEmail: input.buyerEmail,
      expiresAt: input.payment.expires_at
        ? new Date(input.payment.expires_at)
        : null,
    });
    const { data: updated, error } = await admin
      .from("payment_requests")
      .update({
        ...taxPatch,
        stripe_checkout_session_id: session.sessionId,
        checkout_url: session.checkoutUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.payment.id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error || !updated) {
      console.error("attachProcessorCheckout stripe:", error?.message);
      throw new Error("payment_link_save_failed");
    }
    return updated as PaymentRequestRow;
  }

  const connection = await getOrgSquareConnectionRecord(
    input.payment.organization_id,
  );
  if (!connection) throw new Error("square_not_connected");

  if (
    input.payment.checkout_url &&
    input.payment.square_order_id &&
    (!input.tax || input.payment.tax_cents === taxCents)
  ) {
    return input.payment;
  }

  const link = await createSquarePaymentLink({
    connection,
    amountCents: input.payment.amount_cents,
    currency: input.payment.currency,
    name: input.payment.description,
    paymentNote: input.payment.id,
    redirectUrl,
    buyerEmail: input.buyerEmail,
    tax:
      input.tax && input.tax.taxCents > 0
        ? { name: input.tax.taxLabel, percentage: input.tax.taxPercent }
        : null,
  });

  const { data: updated, error } = await admin
    .from("payment_requests")
    .update({
      ...taxPatch,
      square_payment_link_id: link.paymentLinkId,
      square_order_id: link.orderId,
      checkout_url: link.checkoutUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.payment.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !updated) {
    console.error("attachProcessorCheckout square:", error?.message);
    throw new Error("payment_link_save_failed");
  }
  return updated as PaymentRequestRow;
}

export function paymentWindowOpen(
  payment: { expires_at?: string | null },
  now = Date.now(),
) {
  if (!payment.expires_at) return true;
  return Date.parse(payment.expires_at) >= now;
}

/** Checkout Session expiry must not kill a still-valid payment link. */
export async function reopenUnexpiredCheckout(
  payment: PaymentRequestRow,
): Promise<PaymentRequestRow> {
  if (payment.status === "pending") return payment;
  if (payment.status !== "expired" && payment.status !== "failed") {
    return payment;
  }
  if (!paymentWindowOpen(payment)) return payment;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .update({
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .in("status", ["expired", "failed"])
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("reopenUnexpiredCheckout:", error.message);
    return payment;
  }
  return (data as PaymentRequestRow) ?? payment;
}

export async function loadPaymentByToken(token: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select(
      "id, organization_id, source, status, amount_cents, tax_cents, tax_percent, tax_label, tax_country, tax_region, sage_tax_rate_id, sage_invoice_id, currency, description, project_id, person_id, appointment_id, processor, checkout_url, square_order_id, square_payment_id, stripe_account_id, stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_at, expires_at",
    )
    .eq("token_hash", hashBookingToken(token))
    .maybeSingle();
  if (error) {
    console.error("loadPaymentByToken:", error.message);
    return null;
  }
  return (data as PaymentRequestRow | null) ?? null;
}

export async function loadPaymentByOrderId(orderId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select("*")
    .eq("square_order_id", orderId)
    .maybeSingle();
  if (error) {
    console.error("loadPaymentByOrderId:", error.message);
    return null;
  }
  return data as PaymentRequestRow | null;
}

export async function loadPaymentById(paymentId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) {
    console.error("loadPaymentById:", error.message);
    return null;
  }
  return data as PaymentRequestRow | null;
}

export async function loadPaymentByStripeSessionId(sessionId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select("*")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("loadPaymentByStripeSessionId:", error.message);
    return null;
  }
  return data as PaymentRequestRow | null;
}

export async function markPaymentPaid(input: {
  paymentId: string;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "paid",
    paid_at: now,
    updated_at: now,
  };
  if (input.squarePaymentId) patch.square_payment_id = input.squarePaymentId;
  if (input.squareOrderId) patch.square_order_id = input.squareOrderId;
  if (input.stripeCheckoutSessionId) {
    patch.stripe_checkout_session_id = input.stripeCheckoutSessionId;
  }
  if (input.stripePaymentIntentId) {
    patch.stripe_payment_intent_id = input.stripePaymentIntentId;
  }

  const { data: payment, error } = await admin
    .from("payment_requests")
    .update(patch)
    .eq("id", input.paymentId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("markPaymentPaid:", error.message);
    return null;
  }
  if (!payment) {
    return loadPaymentById(input.paymentId);
  }

  const row = payment as PaymentRequestRow;
  if (row.source === "booking" && row.appointment_id) {
    await confirmPaidBookingAppointment(row);
  }
  if (row.person_id) {
    try {
      const { createSageInvoiceForPayment } = await import(
        "@/lib/sage/checkout"
      );
      await createSageInvoiceForPayment(row);
    } catch (error) {
      console.error("sage invoice after payment:", error);
    }
  }

  return row;
}

async function confirmPaidBookingAppointment(payment: PaymentRequestRow) {
  if (!payment.appointment_id) return;
  const admin = createServiceClient();
  const { data: appointment, error } = await admin
    .from("booking_appointments")
    .update({
      status: "confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.appointment_id)
    .eq("status", "pending_payment")
    .select(
      "id, organization_id, host_user_id, service_id, starts_at, ends_at, guest_name, guest_email, guest_phone, guest_preferred_locale, manage_token_encrypted, google_event_id, microsoft_event_id, meet_join_url, project_id",
    )
    .maybeSingle();

  if (error || !appointment) {
    if (error) console.error("confirm appointment:", error.message);
    return;
  }

  const alreadyOnCalendar = Boolean(
    appointment.google_event_id || appointment.microsoft_event_id,
  );
  const existingMeet =
    typeof appointment.meet_join_url === "string" &&
    appointment.meet_join_url.startsWith("https://")
      ? appointment.meet_join_url
      : null;

  const [{ data: service }, { data: host }, { data: org }, { data: settings }] =
    await Promise.all([
      admin
        .from("booking_services")
        .select("title, translations")
        .eq("id", appointment.service_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", appointment.host_user_id)
        .maybeSingle(),
      admin
        .from("organizations")
        .select("name")
        .eq("id", appointment.organization_id)
        .maybeSingle(),
      admin
        .from("booking_settings")
        .select("timezone")
        .eq("organization_id", appointment.organization_id)
        .maybeSingle(),
    ]);

  const dek = await getOrgDataKey(appointment.organization_id as string);
  const guest = decryptBookingGuestRow(
    {
      guest_name: appointment.guest_name as string,
      guest_email: appointment.guest_email as string,
      guest_phone: appointment.guest_phone as string,
    },
    dek,
  );

  const hostName =
    (host?.full_name as string | null)?.trim() ||
    (host?.email as string | null) ||
    "Consultant";
  const preferredLocale = (
    (appointment.guest_preferred_locale as string | null) || "en"
  ) as "en" | "fr" | "es";
  const resolvedServiceTitle =
    serviceTitle(service, preferredLocale) || "Consultation";
  const organizationName = (org?.name as string | null) || "Firm";
  const timezone = (settings?.timezone as string | null) || "America/Toronto";

  let meetJoinUrl = existingMeet;
  if (!alreadyOnCalendar) {
    const { pushAppointmentToHostCalendars } = await import(
      "@/lib/calendar/host-calendar"
    );
    const calendar = await pushAppointmentToHostCalendars({
      organizationId: appointment.organization_id as string,
      hostUserId: appointment.host_user_id as string,
      appointmentId: appointment.id as string,
      title: `${resolvedServiceTitle} — ${guest.guest_name}`,
      description: `Booked via ${product.name}\n${guest.guest_name}\n${guest.guest_email}\n${guest.guest_phone ?? ""}`,
      startsAt: appointment.starts_at as string,
      endsAt: appointment.ends_at as string,
    });
    meetJoinUrl = calendar.meetJoinUrl;
  }

  const origin = await getAppBaseUrl();
  let manageUrl = `${origin}/${preferredLocale}/book`;
  let cancelUrl = manageUrl;
  const encrypted = appointment.manage_token_encrypted as string | null;
  if (encrypted) {
    try {
      const manageToken = decryptField(encrypted, MANAGE_TOKEN_AAD, dek);
      const urls = bookingManageUrls(origin, preferredLocale, manageToken);
      manageUrl = urls.manageUrl;
      cancelUrl = urls.cancelUrl;
    } catch (err) {
      console.error("decrypt manage token:", err);
    }
  }

  after(async () => {
    const {
      sendBookingConfirmationEmail,
      sendBookingPaymentReceivedEmail,
    } = await import("@/lib/email/booking-confirmation");
    if (alreadyOnCalendar) {
      await sendBookingPaymentReceivedEmail({
        locale: preferredLocale,
        to: guest.guest_email,
        guestName: guest.guest_name,
        organizationName,
        organizationId: appointment.organization_id as string,
        hostName,
        hostUserId: appointment.host_user_id as string,
        appointmentId: appointment.id as string,
        serviceTitle: resolvedServiceTitle,
        startsAt: appointment.starts_at as string,
        timezone,
        manageUrl,
      });
    } else {
      await sendBookingConfirmationEmail({
        locale: preferredLocale,
        to: guest.guest_email,
        guestName: guest.guest_name,
        organizationName,
        organizationId: appointment.organization_id as string,
        hostName,
        hostUserId: appointment.host_user_id as string,
        appointmentId: appointment.id as string,
        serviceTitle: resolvedServiceTitle,
        startsAt: appointment.starts_at as string,
        timezone,
        meetJoinUrl,
        manageUrl,
        cancelUrl,
      });
    }
    const { issueContractsForAppointment } = await import(
      "@/lib/contracts/issue"
    );
    await issueContractsForAppointment(appointment.id as string);
  });
}

export async function listProjectPayments(projectId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select(
      "id, status, amount_cents, currency, description, checkout_url, paid_at, created_at, token_encrypted",
    )
    .eq("project_id", projectId)
    .eq("source", "project")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listProjectPayments:", error.message);
    return [];
  }
  return data ?? [];
}

export function decryptPaymentToken(
  encrypted: string | null | undefined,
  orgKey: Buffer,
) {
  if (!encrypted) return null;
  try {
    return decryptField(encrypted, PAYMENT_TOKEN_AAD, orgKey);
  } catch {
    return null;
  }
}

/**
 * On booking cancel: Square refund if paid and policy allows (minus fee),
 * otherwise mark pending checkout cancelled. Failures are logged; callers
 * should still treat the appointment as cancelled.
 */
export async function settlePaymentOnBookingCancel(input: {
  organizationId: string;
  appointmentId: string;
  startsAt?: string;
  reason?: string;
}): Promise<{
  outcome:
    | "refunded"
    | "cancelled"
    | "none"
    | "skipped"
    | "failed";
}> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select(
      "id, organization_id, source, status, amount_cents, tax_cents, currency, description, project_id, person_id, appointment_id, processor, checkout_url, square_order_id, square_payment_id, square_refund_id, stripe_account_id, stripe_checkout_session_id, stripe_payment_intent_id, stripe_refund_id, paid_at, refunded_at, created_at",
    )
    .eq("appointment_id", input.appointmentId)
    .eq("organization_id", input.organizationId)
    .eq("source", "booking")
    .maybeSingle();

  if (error) {
    console.error("settlePaymentOnBookingCancel load:", error.message);
    return { outcome: "failed" };
  }
  if (!data) return { outcome: "none" };

  const payment = data as PaymentRequestRow;
  if (payment.status === "refunded" || payment.status === "cancelled") {
    return {
      outcome: payment.status === "refunded" ? "refunded" : "cancelled",
    };
  }

  if (payment.status === "pending") {
    const now = new Date().toISOString();
    const { error: cancelError } = await admin
      .from("payment_requests")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (cancelError) {
      console.error(
        "settlePaymentOnBookingCancel cancel pending:",
        cancelError.message,
      );
      return { outcome: "failed" };
    }
    return { outcome: "cancelled" };
  }

  if (payment.status !== "paid") {
    return { outcome: "none" };
  }

  try {
    const { loadEnabledCancelPolicyRow, getOrgStripeConnectionRecord } =
      await import("@/lib/payments/processor");
    const policyRow =
      (await loadEnabledCancelPolicyRow(input.organizationId)) ??
      (payment.processor === "stripe"
        ? await getOrgStripeConnectionRecord(input.organizationId)
        : await getOrgSquareConnectionRecord(input.organizationId));
    if (!policyRow) throw new Error("cancel_policy_missing");

    const policy = normalizeSquareCancelRefundPolicy(policyRow);
    const chargedCents = payment.amount_cents + (payment.tax_cents ?? 0);
    const { refundCents } = computeCancelRefundAmounts(
      chargedCents,
      policy,
      input.startsAt,
    );

    if (!policy.cancelRefundEnabled || refundCents <= 0) {
      return { outcome: "skipped" };
    }

    if ((payment.processor || "square") === "stripe") {
      const accountId = payment.stripe_account_id;
      let paymentIntentId = payment.stripe_payment_intent_id;
      if (!paymentIntentId && payment.stripe_checkout_session_id && accountId) {
        const { getStripe } = await import("@/lib/stripe/client");
        const session = await getStripe().checkout.sessions.retrieve(
          payment.stripe_checkout_session_id,
          {},
          { stripeAccount: accountId },
        );
        const intent = session.payment_intent;
        paymentIntentId =
          typeof intent === "string" ? intent : (intent?.id ?? null);
        if (paymentIntentId) {
          await admin
            .from("payment_requests")
            .update({
              stripe_payment_intent_id: paymentIntentId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id);
        }
      }
      if (!accountId || !paymentIntentId) {
        throw new Error("stripe_payment_intent_missing");
      }
      const refund = await refundConnectedCharge({
        stripeAccountId: accountId,
        paymentIntentId,
        amountCents: refundCents,
        idempotencyKey: `refund-${payment.id}`,
      });
      const now = new Date().toISOString();
      const { error: refundUpdateError } = await admin
        .from("payment_requests")
        .update({
          status: "refunded",
          stripe_refund_id: refund.refundId,
          refunded_at: now,
          updated_at: now,
        })
        .eq("id", payment.id)
        .eq("status", "paid");
      if (refundUpdateError) {
        console.error(
          "settlePaymentOnBookingCancel mark refunded:",
          refundUpdateError.message,
        );
        return { outcome: "failed" };
      }
      return { outcome: "refunded" };
    }

    const connection = await getOrgSquareConnectionRecord(input.organizationId);
    if (!connection) throw new Error("square_not_connected");

    let squarePaymentId = payment.square_payment_id;
    if (!squarePaymentId && payment.square_order_id) {
      squarePaymentId = await findSquarePaymentIdByOrderId({
        connection,
        orderId: payment.square_order_id,
      });
      if (squarePaymentId) {
        await admin
          .from("payment_requests")
          .update({
            square_payment_id: squarePaymentId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
      }
    }
    if (!squarePaymentId) throw new Error("square_payment_id_missing");

    const refund = await refundSquarePayment({
      connection,
      paymentId: squarePaymentId,
      amountCents: refundCents,
      currency: payment.currency,
      reason: input.reason ?? "Booking cancelled",
      idempotencyKey: `refund-${payment.id}`,
    });

    const now = new Date().toISOString();
    const { error: refundUpdateError } = await admin
      .from("payment_requests")
      .update({
        status: "refunded",
        square_refund_id: refund.refundId,
        refunded_at: now,
        updated_at: now,
      })
      .eq("id", payment.id)
      .eq("status", "paid");

    if (refundUpdateError) {
      console.error(
        "settlePaymentOnBookingCancel mark refunded:",
        refundUpdateError.message,
      );
      return { outcome: "failed" };
    }

    return { outcome: "refunded" };
  } catch (err) {
    console.error("settlePaymentOnBookingCancel refund:", err);
    return { outcome: "failed" };
  }
}
