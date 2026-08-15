import { after } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

import {
  computeCancelRefundAmounts,
  normalizeSquareCancelRefundPolicy,
} from "./cancel-policy";
import {
  createSquarePaymentLink,
  findSquarePaymentIdByOrderId,
  getOrgSquareConnection,
  refundSquarePayment,
} from "./client";

const PAYMENT_TOKEN_AAD = "payment_requests.token_encrypted";
export const MANAGE_TOKEN_AAD = "booking_appointments.manage_token_encrypted";

export type PaymentRequestRow = {
  id: string;
  organization_id: string;
  source: "booking" | "project";
  status: string;
  amount_cents: number;
  currency: string;
  description: string;
  project_id: string | null;
  person_id: string | null;
  appointment_id: string | null;
  checkout_url: string | null;
  square_order_id: string | null;
  square_payment_id: string | null;
  square_refund_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
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
  const connection = await getOrgSquareConnection(input.organizationId);
  if (!connection) throw new Error("square_not_connected");

  const token = createBookingToken();
  const tokenHash = hashBookingToken(token);
  const origin = await getAppBaseUrl();
  const redirectUrl = `${origin.replace(/\/$/, "")}/${input.locale}/pay/${token}`;

  const admin = createServiceClient();
  const expiresAt = (
    input.expiresAt ??
    new Date(Date.now() + (input.expiresInHours ?? 72) * 3_600_000)
  ).toISOString();

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
      token_hash: tokenHash,
      token_encrypted: encryptField(token, PAYMENT_TOKEN_AAD),
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error || !payment) {
    console.error("create payment request:", error?.message);
    throw new Error("payment_create_failed");
  }

  try {
    const link = await createSquarePaymentLink({
      connection,
      amountCents: input.amountCents,
      currency: input.currency,
      name: input.description,
      paymentNote: payment.id as string,
      redirectUrl,
      buyerEmail: input.buyerEmail,
    });

    const { data: updated, error: updateError } = await admin
      .from("payment_requests")
      .update({
        square_payment_link_id: link.paymentLinkId,
        square_order_id: link.orderId,
        checkout_url: link.checkoutUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("update payment link:", updateError?.message);
      throw new Error("payment_link_save_failed");
    }

    return {
      payment: updated as PaymentRequestRow,
      token,
      checkoutUrl: link.checkoutUrl,
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

export async function loadPaymentByToken(token: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("payment_requests")
    .select(
      "id, organization_id, source, status, amount_cents, currency, description, project_id, person_id, appointment_id, checkout_url, square_order_id, square_payment_id, paid_at, created_at, expires_at",
    )
    .eq("token_hash", hashBookingToken(token))
    .maybeSingle();
  if (error) {
    console.error("loadPaymentByToken:", error.message);
    return null;
  }
  return data as
    | (PaymentRequestRow & { expires_at: string | null })
    | null;
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

export async function markPaymentPaid(input: {
  paymentId: string;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
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
      "id, organization_id, host_user_id, service_id, starts_at, ends_at, guest_name, guest_email, guest_phone, guest_preferred_locale, manage_token_encrypted, google_event_id, meet_join_url",
    )
    .maybeSingle();

  if (error || !appointment) {
    if (error) console.error("confirm appointment:", error.message);
    return;
  }

  const alreadyOnCalendar = Boolean(appointment.google_event_id);
  const existingMeet =
    typeof appointment.meet_join_url === "string" &&
    appointment.meet_join_url.startsWith("https://")
      ? appointment.meet_join_url
      : null;

  const [{ data: service }, { data: host }, { data: org }, { data: settings }] =
    await Promise.all([
      admin
        .from("booking_services")
        .select("title")
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
  const serviceTitle = (service?.title as string | null) || "Consultation";
  const organizationName = (org?.name as string | null) || "Firm";
  const timezone = (settings?.timezone as string | null) || "America/Toronto";
  const preferredLocale = (
    (appointment.guest_preferred_locale as string | null) || "en"
  ) as "en" | "fr" | "es";

  let meetJoinUrl = existingMeet;
  if (!alreadyOnCalendar) {
    const { pushAppointmentToGoogleCalendar } = await import(
      "@/lib/google/calendar"
    );
    const google = await pushAppointmentToGoogleCalendar({
      organizationId: appointment.organization_id as string,
      hostUserId: appointment.host_user_id as string,
      appointmentId: appointment.id as string,
      title: `${serviceTitle} — ${guest.guest_name}`,
      description: `Booked via Yuzu Immigration\n${guest.guest_name}\n${guest.guest_email}\n${guest.guest_phone ?? ""}`,
      startsAt: appointment.starts_at as string,
      endsAt: appointment.ends_at as string,
    });
    meetJoinUrl = google?.meetJoinUrl ?? null;
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
        hostName,
        serviceTitle,
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
        hostName,
        serviceTitle,
        startsAt: appointment.starts_at as string,
        timezone,
        meetJoinUrl,
        manageUrl,
        cancelUrl,
      });
    }
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

export function decryptPaymentToken(encrypted: string | null | undefined) {
  if (!encrypted) return null;
  try {
    return decryptField(encrypted, PAYMENT_TOKEN_AAD);
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
      "id, organization_id, source, status, amount_cents, currency, description, project_id, person_id, appointment_id, checkout_url, square_order_id, square_payment_id, square_refund_id, paid_at, refunded_at, created_at",
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
    const connection = await getOrgSquareConnection(input.organizationId);
    if (!connection) throw new Error("square_not_connected");

    const policy = normalizeSquareCancelRefundPolicy(connection);
    const { refundCents } = computeCancelRefundAmounts(
      payment.amount_cents,
      policy,
    );

    if (!policy.cancelRefundEnabled || refundCents <= 0) {
      return { outcome: "skipped" };
    }

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
