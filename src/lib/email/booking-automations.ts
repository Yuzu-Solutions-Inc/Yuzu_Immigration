import { decryptBookingFormAnswers, decryptBookingGuestRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { email } from "@/lib/design-tokens";
import { sendResendEmail } from "@/lib/email/resend";
import {
  automationVariablesFor,
  isAutomationDue,
  parseAutomationTranslations,
  pickAutomationCopy,
  renderAutomationHtml,
  renderAutomationPlain,
  resolveRecipientAddresses,
} from "@/lib/email/automation-template";
import { normalizeDayOffsets } from "@/lib/booking/day-offsets";
import { extraAutomationVariables } from "@/lib/booking/form-fields";
import { serviceTitle } from "@/lib/booking/service-i18n";
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
  | "form_answers"
  | "guest_preferred_locale"
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
  const enabled = (automations ?? []) as Omit<
    ServiceEmailAutomationRow,
    "service_ids"
  >[];
  if (enabled.length === 0) return { processed: 0, sent: 0 };

  const { data: links, error: linksError } = await admin
    .from("booking_email_automation_services")
    .select("automation_id, service_id")
    .in(
      "automation_id",
      enabled.map((row) => row.id),
    );
  if (linksError) {
    console.error("booking automations services:", linksError.message);
    return { processed: 0, sent: 0 };
  }
  const serviceIdsByAutomation = new Map<string, Set<string>>();
  for (const link of links ?? []) {
    const set = serviceIdsByAutomation.get(link.automation_id) ?? new Set();
    set.add(link.service_id);
    serviceIdsByAutomation.set(link.automation_id, set);
  }
  const serviceIds = [
    ...new Set((links ?? []).map((link) => link.service_id as string)),
  ];
  if (serviceIds.length === 0) return { processed: 0, sent: 0 };

  const maxDays = Math.max(
    0,
    ...enabled.flatMap((row) => normalizeDayOffsets(row.days_before)),
  );
  const windowEnd = new Date(now.getTime() + (maxDays + 1) * 86_400_000);

  const { data: appointments, error: appointmentError } = await admin
    .from("booking_appointments")
    .select(
      "id, organization_id, service_id, host_user_id, starts_at, guest_name, guest_email, status, meet_join_url, person_id, form_answers, guest_preferred_locale",
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
      admin.from("organizations").select("id, name, default_locale").in("id", orgIds),
      admin
        .from("booking_settings")
        .select("organization_id, timezone")
        .in("organization_id", orgIds),
      admin
        .from("booking_services")
        .select("id, title, translations, duration_minutes")
        .in("id", serviceIds),
      admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", hostIds),
      admin
        .from("booking_automation_sends")
        .select("automation_id, appointment_id, days_before, appointment_starts_at")
        .in("appointment_id", appointmentIds),
    ]);

  const orgName = new Map(
    (orgsRes.data ?? []).map((row) => [row.id as string, row.name as string]),
  );
  const orgDefaultLocale = new Map(
    (orgsRes.data ?? []).map((row) => [
      row.id as string,
      (row.default_locale as string | null) || "en",
    ]),
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
      row as Pick<
        BookingServiceRow,
        "id" | "title" | "duration_minutes" | "translations"
      >,
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
        `${row.automation_id}:${row.appointment_id}:${row.days_before}:${row.appointment_starts_at}`,
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
    const matching = enabled.filter((row) =>
      serviceIdsByAutomation.get(row.id)?.has(appointment.service_id),
    );
    if (matching.length === 0) continue;

    const timeZone =
      timezoneByOrg.get(appointment.organization_id) ?? DEFAULT_TZ;
    const startsAt = new Date(appointment.starts_at);
    const dek = await dekFor(appointment.organization_id);
    const guest = decryptBookingGuestRow(appointment, dek);
    const host = profileById.get(appointment.host_user_id);
    const formAnswers = decryptBookingFormAnswers(appointment.form_answers, dek);
    const answers = extraAutomationVariables(formAnswers);
    const preferredLocale =
      appointment.guest_preferred_locale ||
      formAnswers?.preferred_language ||
      null;
    const defaultLocale =
      orgDefaultLocale.get(appointment.organization_id) ?? "en";

    for (const automation of matching) {
      const offsets = normalizeDayOffsets(automation.days_before);
      if (offsets.length === 0) continue;

      let prepared:
        | {
            subject: string;
            text: string;
            html: string;
            emailLocale: string;
            addresses: string[];
          }
        | null = null;

      for (const daysBefore of offsets) {
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
        const sendKey = `${automation.id}:${appointment.id}:${daysBefore}:${appointment.starts_at}`;
        if (sentKeys.has(sendKey)) continue;

        if (!prepared) {
          const { copy, locale: emailLocale } = pickAutomationCopy({
            translations: parseAutomationTranslations(automation.translations),
            fallback: {
              subject: automation.subject,
              body: automation.body,
            },
            preferredLocale,
            orgDefaultLocale: defaultLocale,
          });
          const vars = automationVariablesFor({
            locale: emailLocale,
            timeZone,
            customerName: guest.guest_name,
            customerEmail: guest.guest_email,
            serviceName: serviceTitle(service, preferredLocale, defaultLocale),
            consultantName: host?.name ?? appointment.host_user_id,
            consultantEmail: host?.email ?? "",
            organizationName:
              orgName.get(appointment.organization_id) ?? "Yuzu Immigration",
            startsAt,
            durationMinutes: service.duration_minutes,
            meetJoinUrl: appointment.meet_join_url,
            extra: answers,
          });
          const addresses = resolveRecipientAddresses(
            automation.recipients ?? [],
            vars,
          );
          if (addresses.length === 0) break;
          prepared = {
            subject: renderAutomationPlain(copy.subject, vars),
            text: renderAutomationPlain(copy.body, vars),
            html: `<!doctype html>
<html lang="${emailLocale}">
  <body style="margin:0;padding:24px;background:${email.bodyBg};color:${email.text};font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:${email.cardBg};border:1px solid ${email.border};border-radius:12px;padding:28px 24px;font-size:15px;line-height:1.5;">
      ${renderAutomationHtml(copy.body, vars)}
    </div>
  </body>
</html>`,
            emailLocale,
            addresses,
          };
        }

        const { error: claimError } = await admin
          .from("booking_automation_sends")
          .insert({
            organization_id: appointment.organization_id,
            automation_id: automation.id,
            appointment_id: appointment.id,
            days_before: daysBefore,
            appointment_starts_at: appointment.starts_at,
          });
        if (claimError) {
          if (claimError.code !== "23505") {
            console.error("booking automation claim:", claimError.message);
          }
          continue;
        }
        sentKeys.add(sendKey);

        let allSent = true;
        for (const to of prepared.addresses) {
          const result = await sendResendEmail({
            to,
            subject: prepared.subject,
            html: prepared.html,
            text: prepared.text,
            organizationName:
              orgName.get(appointment.organization_id) ?? "Yuzu Immigration",
            locale: prepared.emailLocale,
            includeDoNotReply: automation.include_do_not_reply !== false,
          });
          if (!result.sent) allSent = false;
        }
        if (!allSent) {
          await admin
            .from("booking_automation_sends")
            .delete()
            .eq("automation_id", automation.id)
            .eq("appointment_id", appointment.id)
            .eq("days_before", daysBefore)
            .eq("appointment_starts_at", appointment.starts_at);
          sentKeys.delete(sendKey);
          continue;
        }
        sent += 1;
      }
    }
  }

  return { processed, sent };
}
