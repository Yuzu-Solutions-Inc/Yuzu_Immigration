import { decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email/resend";
import {
  automationVariablesFor,
  isAutomationDue,
  renderAutomationHtml,
  renderAutomationPlain,
  resolveRecipientAddresses,
} from "@/lib/email/automation-template";
import type {
  BookingAppointmentRow,
  BookingServiceRow,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";

const DEFAULT_TZ = "America/Toronto";

type AppointmentSendRow = Pick<
  BookingAppointmentRow,
  | "id"
  | "organization_id"
  | "service_id"
  | "host_user_id"
  | "starts_at"
  | "guest_name"
  | "guest_email"
  | "status"
  | "meet_join_url"
  | "person_id"
>;

export async function processDueBookingAutomations(now = new Date()) {
  const admin = createServiceClient();
  const { data: automations, error: automationError } = await admin
    .from("booking_service_email_automations")
    .select("*")
    .eq("is_enabled", true);
  if (automationError) {
    console.error("booking automations list:", automationError.message);
    return { processed: 0, sent: 0 };
  }
  const enabled = (automations ?? []) as ServiceEmailAutomationRow[];
  if (enabled.length === 0) return { processed: 0, sent: 0 };

  const maxDays = Math.max(0, ...enabled.map((row) => row.days_before));
  const windowEnd = new Date(now.getTime() + (maxDays + 1) * 86_400_000);
  const serviceIds = [...new Set(enabled.map((row) => row.service_id))];

  const { data: appointments, error: appointmentError } = await admin
    .from("booking_appointments")
    .select(
      "id, organization_id, service_id, host_user_id, starts_at, guest_name, guest_email, status, meet_join_url, person_id",
    )
    .eq("status", "confirmed")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .in("service_id", serviceIds);
  if (appointmentError) {
    console.error("booking automations appointments:", appointmentError.message);
    return { processed: 0, sent: 0 };
  }
  const upcoming = (appointments ?? []) as AppointmentSendRow[];
  if (upcoming.length === 0) return { processed: 0, sent: 0 };

  const orgIds = [...new Set(upcoming.map((row) => row.organization_id))];
  const hostIds = [...new Set(upcoming.map((row) => row.host_user_id))];
  const appointmentIds = upcoming.map((row) => row.id);

  const [orgsRes, settingsRes, servicesRes, profilesRes, sendsRes] =
    await Promise.all([
      admin.from("organizations").select("id, name").in("id", orgIds),
      admin
        .from("booking_settings")
        .select("organization_id, timezone")
        .in("organization_id", orgIds),
      admin
        .from("booking_services")
        .select("id, title, duration_minutes")
        .in("id", serviceIds),
      admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", hostIds),
      admin
        .from("booking_automation_sends")
        .select("automation_id, appointment_id, appointment_starts_at")
        .in("appointment_id", appointmentIds),
    ]);

  const orgName = new Map(
    (orgsRes.data ?? []).map((row) => [row.id as string, row.name as string]),
  );
  const timezoneByOrg = new Map(
    (settingsRes.data ?? []).map((row) => [
      row.organization_id as string,
      (row.timezone as string) || DEFAULT_TZ,
    ]),
  );
  const serviceById = new Map(
    (servicesRes.data ?? []).map((row) => [
      row.id as string,
      row as Pick<BookingServiceRow, "id" | "title" | "duration_minutes">,
    ]),
  );
  const profileById = new Map(
    (profilesRes.data ?? []).map((row) => [
      row.id as string,
      {
        name:
          (row.full_name as string | null)?.trim() ||
          (row.email as string | null) ||
          (row.id as string),
        email: ((row.email as string | null) ?? "").trim(),
      },
    ]),
  );
  const sentKeys = new Set(
    (sendsRes.data ?? []).map(
      (row) =>
        `${row.automation_id}:${row.appointment_id}:${row.appointment_starts_at}`,
    ),
  );

  const dekByOrg = new Map<string, Buffer>();
  async function dekFor(orgId: string) {
    const cached = dekByOrg.get(orgId);
    if (cached) return cached;
    const key = await getOrgDataKey(orgId);
    dekByOrg.set(orgId, key);
    return key;
  }

  let processed = 0;
  let sent = 0;

  for (const appointment of upcoming) {
    const service = serviceById.get(appointment.service_id);
    if (!service) continue;
    const matching = enabled.filter(
      (row) =>
        row.service_id === appointment.service_id &&
        row.organization_id === appointment.organization_id,
    );
    if (matching.length === 0) continue;

    const timeZone =
      timezoneByOrg.get(appointment.organization_id) ?? DEFAULT_TZ;
    const startsAt = new Date(appointment.starts_at);
    const dek = await dekFor(appointment.organization_id);
    const guest = decryptBookingGuestRow(appointment, dek);
    const host = profileById.get(appointment.host_user_id);
    const vars = automationVariablesFor({
      locale: "en",
      timeZone,
      customerName: guest.guest_name,
      customerEmail: guest.guest_email,
      serviceName: service.title,
      consultantName: host?.name ?? appointment.host_user_id,
      consultantEmail: host?.email ?? "",
      organizationName:
        orgName.get(appointment.organization_id) ?? "MyConsultant",
      startsAt,
      durationMinutes: service.duration_minutes,
      meetJoinUrl: appointment.meet_join_url,
    });

    for (const automation of matching) {
      processed += 1;
      if (
        !isAutomationDue({
          startsAt,
          daysBefore: automation.days_before,
          now,
          timeZone,
        })
      ) {
        continue;
      }
      const sendKey = `${automation.id}:${appointment.id}:${appointment.starts_at}`;
      if (sentKeys.has(sendKey)) continue;

      const addresses = resolveRecipientAddresses(
        automation.recipients ?? [],
        vars,
      );
      if (addresses.length === 0) continue;

      const { error: claimError } = await admin
        .from("booking_automation_sends")
        .insert({
          organization_id: appointment.organization_id,
          automation_id: automation.id,
          appointment_id: appointment.id,
          appointment_starts_at: appointment.starts_at,
        });
      if (claimError) {
        if (claimError.code !== "23505") {
          console.error("booking automation claim:", claimError.message);
        }
        continue;
      }
      sentKeys.add(sendKey);

      const subject = renderAutomationPlain(automation.subject, vars);
      const text = renderAutomationPlain(automation.body, vars);
      const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F9FAFB;color:#111827;font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #E5E7EB;border-radius:12px;padding:28px 24px;font-size:15px;line-height:1.5;">
      ${renderAutomationHtml(automation.body, vars)}
    </div>
  </body>
</html>`;

      let allSent = true;
      for (const to of addresses) {
        const result = await sendResendEmail({ to, subject, html, text });
        if (!result.sent) allSent = false;
      }
      if (!allSent) {
        await admin
          .from("booking_automation_sends")
          .delete()
          .eq("automation_id", automation.id)
          .eq("appointment_id", appointment.id)
          .eq("appointment_starts_at", appointment.starts_at);
        sentKeys.delete(sendKey);
        continue;
      }
      sent += 1;
    }
  }

  return { processed, sent };
}
