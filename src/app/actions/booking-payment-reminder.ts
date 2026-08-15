"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { decryptPaymentToken } from "@/lib/square/payments";
import { zonedDateIso } from "@/lib/booking/timezone";

export type BookingReminderActionState = {
  error?: string;
  message?: string;
};

async function requireManager() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership, user };
}

function daysUntilAppointment(startsAt: string, timeZone: string) {
  const start = new Date(startsAt);
  const today = zonedDateIso(new Date(), timeZone);
  const apptDay = zonedDateIso(start, timeZone);
  const todayMs = Date.parse(`${today}T12:00:00Z`);
  const apptMs = Date.parse(`${apptDay}T12:00:00Z`);
  return Math.max(0, Math.round((apptMs - todayMs) / 86_400_000));
}

export async function sendBookingPaymentReminderAction(
  appointmentId: string,
  locale: string,
): Promise<BookingReminderActionState> {
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return { error: "invalid" };
  }
  const parsedLocale = z.enum(["en", "fr", "es"]).safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { data: appointment, error } = await supabase
    .from("booking_appointments")
    .select(
      "id, organization_id, service_id, host_user_id, starts_at, status, guest_name, guest_email, guest_preferred_locale",
    )
    .eq("id", appointmentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !appointment) return { error: "not_found" };
  if (appointment.status !== "pending_payment") {
    return { error: "not_unpaid" };
  }

  const admin = createServiceClient();
  const { data: payment } = await admin
    .from("payment_requests")
    .select("id, status, token_encrypted, checkout_url")
    .eq("appointment_id", appointmentId)
    .eq("organization_id", orgId)
    .eq("source", "booking")
    .eq("status", "pending")
    .maybeSingle();
  if (!payment) return { error: "no_payment" };

  const token = decryptPaymentToken(payment.token_encrypted as string | null);
  const origin = await getAppBaseUrl();
  const emailLocale = toAppLocale(
    (appointment.guest_preferred_locale as string | null) || parsedLocale.data,
  );
  const payUrl = token
    ? `${origin.replace(/\/$/, "")}/${emailLocale}/pay/${token}`
    : (payment.checkout_url as string | null);
  if (!payUrl) return { error: "no_payment" };

  const [{ data: org }, { data: settings }, { data: service }, { data: host }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("booking_settings")
        .select("timezone")
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("booking_services")
        .select("title")
        .eq("id", appointment.service_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", appointment.host_user_id)
        .maybeSingle(),
    ]);

  const timezone = (settings?.timezone as string | null) || "America/Toronto";
  const dek = await getOrgDataKey(orgId);
  const guest = decryptBookingGuestRow(
    {
      guest_name: appointment.guest_name as string,
      guest_email: appointment.guest_email as string,
    },
    dek,
  );
  const hostName =
    (host?.full_name as string | null)?.trim() ||
    (host?.email as string | null) ||
    "Consultant";
  const daysBefore = daysUntilAppointment(
    appointment.starts_at as string,
    timezone,
  );

  const { sendBookingPaymentReminderEmail } = await import(
    "@/lib/email/booking-confirmation"
  );
  await sendBookingPaymentReminderEmail({
    locale: emailLocale,
    to: guest.guest_email,
    guestName: guest.guest_name,
    organizationName: (org?.name as string | null) || "Firm",
    hostName,
    serviceTitle: (service?.title as string | null) || "Consultation",
    startsAt: appointment.starts_at as string,
    timezone,
    payUrl,
    daysBefore,
  });

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: gate.user.id,
    actorKind: "staff",
    action: "booking.payment.reminder",
    resourceType: "booking_appointment",
    resourceId: appointmentId,
    metadata: { paymentRequestId: payment.id },
  });

  revalidatePath(`/${parsedLocale.data}/bookings`);
  return { message: "sent" };
}
