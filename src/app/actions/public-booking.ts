"use server";

import { after } from "next/server";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { isSlotStillOpen } from "@/lib/booking/slots";
import {
  findPersonByEmail,
  loadPublicBookingContext,
} from "@/lib/booking/queries";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  encryptBookingGuestWrite,
  encryptPersonWrite,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type PublicBookingState = {
  error?: string;
  message?: string;
  appointmentId?: string;
  startsAt?: string;
  endsAt?: string;
  serviceTitle?: string;
  hostName?: string;
  meetJoinUrl?: string;
  manageToken?: string;
};

const bookSchema = z.object({
  token: z.string().min(16).max(200),
  locale: z.enum(["en", "fr", "es"]),
  hostUserId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  endsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.string().trim().email().max(160),
  guestPhone: z.string().trim().min(6).max(40),
  guestAddress: z.string().trim().min(3).max(300),
  privacyAccepted: z.literal("on"),
});

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function submitPublicBookingAction(
  _prev: PublicBookingState,
  formData: FormData,
): Promise<PublicBookingState> {
  const parsed = bookSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    hostUserId: String(formData.get("hostUserId") || ""),
    serviceId: String(formData.get("serviceId") || ""),
    startsAt: String(formData.get("startsAt") || ""),
    endsAt: String(formData.get("endsAt") || ""),
    guestName: String(formData.get("guestName") || ""),
    guestEmail: String(formData.get("guestEmail") || ""),
    guestPhone: String(formData.get("guestPhone") || ""),
    guestAddress: String(formData.get("guestAddress") || ""),
    privacyAccepted: formData.get("privacyAccepted") === "on" ? "on" : "",
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const ctx = await loadPublicBookingContext(parsed.data.token);
  if (!ctx) return { error: "unavailable" };

  const host = ctx.hosts.find((row) => row.userId === parsed.data.hostUserId);
  if (!host) return { error: "invalid_host" };

  const service = ctx.services.find((row) => row.id === parsed.data.serviceId);
  if (!service) return { error: "invalid_service" };

  const open = isSlotStillOpen({
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    durationMinutes: service.duration_minutes,
    rules: host.rules,
    blocked: host.blocked,
    busy: host.busy,
    window: {
      timezone: ctx.settings.timezone,
      bookingWindowDays: ctx.settings.booking_window_days,
      minNoticeHours: ctx.settings.min_notice_hours,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  });
  if (!open) return { error: "slot_taken" };

  const expectedEnd = new Date(
    new Date(parsed.data.startsAt).getTime() +
      service.duration_minutes * 60_000,
  ).toISOString();
  if (expectedEnd !== parsed.data.endsAt) return { error: "slot_taken" };

  const dek = await getOrgDataKey(ctx.organizationId);
  const existingPerson = await findPersonByEmail(
    ctx.organizationId,
    parsed.data.guestEmail,
  );

  const admin = createServiceClient();
  let personId = existingPerson?.id ?? null;

  if (!personId) {
    const names = splitName(parsed.data.guestName);
    const { data: created, error: personError } = await admin
      .from("people")
      .insert({
        organization_id: ctx.organizationId,
        ...encryptPersonWrite(
          {
            first_name: names.firstName,
            last_name: names.lastName,
            email: parsed.data.guestEmail,
            phone: parsed.data.guestPhone,
          },
          dek,
        ),
        preferred_locale: parsed.data.locale,
        immigration_status: "none",
      })
      .select("id")
      .single();
    if (personError || !created) {
      console.error("public booking create person:", personError?.message);
      return { error: "book_failed" };
    }
    personId = created.id as string;
  }

  const manageToken = createBookingToken();
  const { data: appointment, error } = await admin
    .from("booking_appointments")
    .insert({
      organization_id: ctx.organizationId,
      service_id: service.id,
      person_id: personId,
      host_user_id: host.userId,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      ...encryptBookingGuestWrite(
        {
          guest_name: parsed.data.guestName,
          guest_email: parsed.data.guestEmail,
          guest_phone: parsed.data.guestPhone,
          guest_address: parsed.data.guestAddress,
        },
        dek,
      ),
      privacy_accepted_at: new Date().toISOString(),
      status: "confirmed",
      manage_token_hash: hashBookingToken(manageToken),
    })
    .select("id")
    .single();

  if (error || !appointment) {
    if (error?.code === "23P01" || error?.message?.includes("no_overlap")) {
      return { error: "slot_taken" };
    }
    console.error("public booking insert:", error?.message);
    return { error: "book_failed" };
  }

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.appointment.create",
    resourceType: "booking_appointment",
    resourceId: appointment.id,
    metadata: { serviceId: service.id },
  });

  const origin = await getAppBaseUrl();
  const urls = bookingManageUrls(origin, parsed.data.locale, manageToken);

  const { pushAppointmentToGoogleCalendar } = await import(
    "@/lib/google/calendar"
  );
  const google = await pushAppointmentToGoogleCalendar({
    organizationId: ctx.organizationId,
    hostUserId: host.userId,
    appointmentId: appointment.id,
    title: `${service.title} — ${parsed.data.guestName}`,
    description: `Booked via MyConsultant\n${parsed.data.guestName}\n${parsed.data.guestEmail}\n${parsed.data.guestPhone}`,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });
  const meetJoinUrl = google?.meetJoinUrl ?? null;

  after(async () => {
    const { sendBookingConfirmationEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    await sendBookingConfirmationEmail({
      locale: parsed.data.locale,
      to: parsed.data.guestEmail,
      guestName: parsed.data.guestName,
      organizationName: ctx.organizationName,
      hostName: host.name,
      serviceTitle: service.title,
      startsAt: parsed.data.startsAt,
      timezone: ctx.settings.timezone,
      meetJoinUrl,
      manageUrl: urls.manageUrl,
      cancelUrl: urls.cancelUrl,
    });
  });

  return {
    message: "booked",
    appointmentId: appointment.id,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    serviceTitle: service.title,
    hostName: host.name,
    meetJoinUrl: meetJoinUrl ?? undefined,
    manageToken,
  };
}
