import { getAppBaseUrl } from "@/lib/app-url";
import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { isAutomationDue } from "@/lib/email/automation-template";
import { sendBookingPaymentReminderEmail } from "@/lib/email/booking-confirmation";
import { decryptPaymentToken } from "@/lib/square/payments";
import { serviceTitle } from "@/lib/booking/service-i18n";

const DEFAULT_TZ = "America/Toronto";

/**
 * Email unpaid pending_payment appointments using each service's
 * payment_reminder_days offsets (up to 3).
 */
export async function processDuePaymentReminders(now = new Date()) {
  const admin = createServiceClient();
  const { data: services, error: servicesError } = await admin
    .from("booking_services")
    .select("id, title, translations, payment_reminder_days, organization_id")
    .not("payment_reminder_days", "is", null);
  if (servicesError) {
    console.error("payment reminders services:", servicesError.message);
    return { processed: 0, sent: 0 };
  }

  const withReminders = (services ?? []).filter((row) => {
    const days = row.payment_reminder_days as number[] | null;
    return Array.isArray(days) && days.length > 0;
  });
  if (withReminders.length === 0) return { processed: 0, sent: 0 };

  const serviceIds = withReminders.map((row) => row.id as string);
  const maxDays = Math.max(
    0,
    ...withReminders.flatMap((row) => row.payment_reminder_days as number[]),
  );
  const windowEnd = new Date(now.getTime() + (maxDays + 1) * 86_400_000);

  const { data: appointments, error: appointmentError } = await admin
    .from("booking_appointments")
    .select(
      "id, organization_id, service_id, host_user_id, starts_at, guest_name, guest_email, guest_preferred_locale",
    )
    .eq("status", "pending_payment")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .in("service_id", serviceIds);
  if (appointmentError) {
    console.error("payment reminders appointments:", appointmentError.message);
    return { processed: 0, sent: 0 };
  }
  const upcoming = appointments ?? [];
  if (upcoming.length === 0) return { processed: 0, sent: 0 };

  const appointmentIds = upcoming.map((row) => row.id as string);
  const orgIds = [...new Set(upcoming.map((row) => row.organization_id as string))];
  const hostIds = [...new Set(upcoming.map((row) => row.host_user_id as string))];

  const [paymentsRes, orgsRes, settingsRes, profilesRes, sendsRes] =
    await Promise.all([
      admin
        .from("payment_requests")
        .select("id, appointment_id, status, token_encrypted, checkout_url")
        .eq("source", "booking")
        .eq("status", "pending")
        .in("appointment_id", appointmentIds),
      admin.from("organizations").select("id, name").in("id", orgIds),
      admin
        .from("booking_settings")
        .select("organization_id, timezone")
        .in("organization_id", orgIds),
      admin.from("profiles").select("id, full_name, email").in("id", hostIds),
      admin
        .from("booking_payment_reminder_sends")
        .select("appointment_id, days_before, appointment_starts_at")
        .in("appointment_id", appointmentIds),
    ]);

  const paymentByAppointment = new Map(
    (paymentsRes.data ?? []).map((row) => [
      row.appointment_id as string,
      row,
    ]),
  );
  const serviceById = new Map(
    withReminders.map((row) => [row.id as string, row]),
  );
  const orgName = new Map(
    (orgsRes.data ?? []).map((row) => [row.id as string, row.name as string]),
  );
  const timezoneByOrg = new Map(
    (settingsRes.data ?? []).map((row) => [
      row.organization_id as string,
      (row.timezone as string) || DEFAULT_TZ,
    ]),
  );
  const hostById = new Map(
    (profilesRes.data ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        (row.id as string),
    ]),
  );
  const sentKeys = new Set(
    (sendsRes.data ?? []).map(
      (row) =>
        `${row.appointment_id}:${row.days_before}:${row.appointment_starts_at}`,
    ),
  );

  const origin = await getAppBaseUrl();
  let processed = 0;
  let sent = 0;

  for (const appointment of upcoming) {
    const service = serviceById.get(appointment.service_id as string);
    if (!service) continue;
    const payment = paymentByAppointment.get(appointment.id as string);
    if (!payment) continue;

    const dek = await getOrgDataKey(appointment.organization_id as string);
    const token = decryptPaymentToken(
      payment.token_encrypted as string | null,
      dek,
    );
    const checkoutUrl = (payment.checkout_url as string | null) ?? null;
    if (!token && !checkoutUrl) continue;

    const timeZone =
      timezoneByOrg.get(appointment.organization_id as string) ?? DEFAULT_TZ;
    const startsAt = new Date(appointment.starts_at as string);
    const guest = decryptBookingGuestRow(
      {
        guest_name: appointment.guest_name as string,
        guest_email: appointment.guest_email as string,
      },
      dek,
    );
    const locale =
      (appointment.guest_preferred_locale as string | null) || "en";
    const payUrl = token
      ? `${origin.replace(/\/$/, "")}/${locale}/pay/${token}`
      : checkoutUrl!;

    for (const daysBefore of service.payment_reminder_days as number[]) {
      processed += 1;
      if (
        !isAutomationDue({
          startsAt,
          daysBefore,
          now,
          timeZone,
        })
      ) {
        continue;
      }
      const sendKey = `${appointment.id}:${daysBefore}:${appointment.starts_at}`;
      if (sentKeys.has(sendKey)) continue;

      await sendBookingPaymentReminderEmail({
        locale,
        to: guest.guest_email,
        guestName: guest.guest_name,
        organizationName:
          orgName.get(appointment.organization_id as string) ?? "Firm",
        hostName:
          hostById.get(appointment.host_user_id as string) ?? "Consultant",
        serviceTitle: serviceTitle(service, locale) || "Consultation",
        startsAt: appointment.starts_at as string,
        timezone: timeZone,
        payUrl,
        daysBefore,
      });

      const { error: insertError } = await admin
        .from("booking_payment_reminder_sends")
        .insert({
          organization_id: appointment.organization_id,
          appointment_id: appointment.id,
          payment_request_id: payment.id,
          days_before: daysBefore,
          appointment_starts_at: appointment.starts_at,
        });
      if (insertError) {
        console.error("payment reminder send log:", insertError.message);
        continue;
      }
      sentKeys.add(sendKey);
      sent += 1;
    }
  }

  return { processed, sent };
}
