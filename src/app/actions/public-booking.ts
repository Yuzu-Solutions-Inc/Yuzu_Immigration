"use server";

import { after } from "next/server";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import {
  checkManageLinksRateLimit,
  checkPublicBookRateLimit,
  getRequestClientIp,
  hashBookingSubject,
  MAX_FUTURE_BOOKINGS_PER_EMAIL,
  normalizeGuestEmail,
  recordBookingAbuseEvent,
} from "@/lib/booking/abuse";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { parseBookingFormAnswers, isReservedBookingFieldKey } from "@/lib/booking/form-fields";
import {
  findPersonByEmail,
  listFutureGuestAppointmentsByEmail,
  loadBookingPage,
  loadPublicBookingContext,
} from "@/lib/booking/queries";
import { resolveBookingPrice } from "@/lib/booking/pricing";
import { isSlotStillOpen, isUnblockedSlotStillOpen } from "@/lib/booking/slots";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  encryptBookingFormAnswers,
  encryptBookingGuestWrite,
  encryptPersonWrite,
} from "@/lib/security/client-pii";
import {
  appointmentLookupWrite,
  personLookupWrite,
} from "@/lib/security/email-lookup";
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
  checkoutUrl?: string;
  paymentToken?: string;
  existingCount?: number;
  guestEmail?: string;
};

export type ManageLinksState = {
  error?: string;
  message?: string;
};

const bookSchema = z.object({
  token: z.string().min(16).max(200),
  locale: z.enum(["en", "fr", "es"]),
  hostUserId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  endsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  guestFirstName: z.string().trim().min(1).max(80),
  guestLastName: z.string().trim().min(1).max(80),
  guestPreferredLocale: z.enum(["en", "fr", "es"]),
  guestEmail: z.string().trim().email().max(160),
  guestPhone: z.string().trim().min(6).max(40),
  guestAddress: z.string().trim().max(300).optional().default(""),
  privacyAccepted: z.literal("on"),
  termsAccepted: z.literal("on"),
  confirmAnother: z.enum(["on"]).optional(),
});

const manageLinksSchema = z.object({
  token: z.string().min(16).max(200),
  locale: z.enum(["en", "fr", "es"]),
  guestEmail: z.string().trim().email().max(160),
});

function joinGuestName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim();
}

async function bookingSubjectHashes(
  organizationId: string,
  email: string,
) {
  const dek = await getOrgDataKey(organizationId);
  const emailHash = hashBookingSubject(
    "email",
    organizationId,
    normalizeGuestEmail(email),
    dek,
  );
  const ip = await getRequestClientIp();
  const ipHash = ip
    ? hashBookingSubject("ip", organizationId, ip, dek)
    : null;
  return { emailHash, ipHash };
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
    guestFirstName: String(formData.get("guestFirstName") || ""),
    guestLastName: String(formData.get("guestLastName") || ""),
    guestPreferredLocale: toAppLocale(
      String(formData.get("guestPreferredLocale") || formData.get("locale") || "en"),
    ),
    guestEmail: String(formData.get("guestEmail") || ""),
    guestPhone: String(formData.get("guestPhone") || ""),
    guestAddress: String(formData.get("guestAddress") || ""),
    privacyAccepted: formData.get("privacyAccepted") === "on" ? "on" : "",
    termsAccepted: formData.get("termsAccepted") === "on" ? "on" : "",
    confirmAnother: formData.get("confirmAnother") === "on" ? "on" : undefined,
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const loaded = await loadBookingPage(parsed.data.token);
  if (loaded.status === "used") return { error: "already_used" };
  if (loaded.status !== "ok") return { error: "unavailable" };
  const ctx = loaded.ctx;

  const guestEmail = normalizeGuestEmail(parsed.data.guestEmail);
  const hashes = await bookingSubjectHashes(ctx.organizationId, guestEmail);
  const rate = await checkPublicBookRateLimit({
    organizationId: ctx.organizationId,
    emailHash: hashes.emailHash,
    ipHash: hashes.ipHash,
  });
  if (rate !== "ok") {
    return { error: "rate_limited", guestEmail };
  }
  await recordBookingAbuseEvent({
    organizationId: ctx.organizationId,
    kind: "book_attempt",
    emailHash: hashes.emailHash,
    ipHash: hashes.ipHash,
  });

  const host = ctx.hosts.find((row) => row.userId === parsed.data.hostUserId);
  if (!host) return { error: "invalid_host" };

  const service = ctx.services.find((row) => row.id === parsed.data.serviceId);
  if (!service) return { error: "invalid_service" };

  const open =
    ctx.slotMode === "unblocked"
      ? isUnblockedSlotStillOpen({
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          durationMinutes: service.duration_minutes,
          blocked: host.blocked,
          busy: host.busy,
          window: {
            timezone: ctx.settings.timezone,
            bookingWindowDays: ctx.settings.booking_window_days,
            minNoticeHours: ctx.settings.min_notice_hours,
            bufferMinutes: ctx.settings.buffer_minutes,
          },
        })
      : isSlotStillOpen({
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

  const serviceFields = (ctx.formFields ?? []).filter(
    (field) =>
      Boolean(service.form_id) &&
      field.form_id === service.form_id &&
      !isReservedBookingFieldKey(field.field_key),
  );
  const parsedAnswers = parseBookingFormAnswers(formData, serviceFields);
  if (!parsedAnswers.ok) return { error: "invalid_form", guestEmail };

  const guestName = joinGuestName(
    parsed.data.guestFirstName,
    parsed.data.guestLastName,
  );
  const preferredLocale = parsed.data.guestPreferredLocale;
  const localizedTitle = serviceTitle(service, preferredLocale);

  const existing = await listFutureGuestAppointmentsByEmail({
    organizationId: ctx.organizationId,
    email: guestEmail,
    locale: preferredLocale,
  });
  if (existing.length >= MAX_FUTURE_BOOKINGS_PER_EMAIL) {
    return {
      error: "too_many_bookings",
      existingCount: existing.length,
      guestEmail,
    };
  }
  if (existing.length > 0 && parsed.data.confirmAnother !== "on") {
    return {
      message: "existing_booking",
      existingCount: existing.length,
      guestEmail,
    };
  }

  const dek = await getOrgDataKey(ctx.organizationId);
  const existingPerson = await findPersonByEmail(
    ctx.organizationId,
    guestEmail,
  );

  const admin = createServiceClient();
  let personId = existingPerson?.id ?? null;

  if (!personId) {
    const { data: created, error: personError } = await admin
      .from("people")
      .insert({
        organization_id: ctx.organizationId,
        ...encryptPersonWrite(
          {
            first_name: parsed.data.guestFirstName,
            last_name: parsed.data.guestLastName,
            email: guestEmail,
            phone: parsed.data.guestPhone,
          },
          dek,
        ),
        ...personLookupWrite(
          ctx.organizationId,
          {
            first_name: parsed.data.guestFirstName,
            last_name: parsed.data.guestLastName,
            email: guestEmail,
          },
          dek,
        ),
        preferred_locale: preferredLocale,
        immigration_status: "none",
      })
      .select("id")
      .single();
    if (personError || !created) {
      console.error("public booking create person:", personError?.message);
      return { error: "book_failed" };
    }
    personId = created.id as string;
  } else if (existingPerson?.preferred_locale !== preferredLocale) {
    await admin
      .from("people")
      .update({
        preferred_locale: preferredLocale,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personId)
      .eq("organization_id", ctx.organizationId);
  }

  const priced = resolveBookingPrice({
    service,
    rateKind: ctx.rateKind,
    startsAt: parsed.data.startsAt,
  });
  const amountCents = priced.amountCents;

  const { getOrgSquareConnection } = await import("@/lib/square/client");
  const squareConnection =
    amountCents > 0
      ? await getOrgSquareConnection(ctx.organizationId)
      : null;
  const requiresPayment = Boolean(squareConnection && amountCents > 0);

  const manageToken = createBookingToken();
  const { encryptField } = await import("@/lib/security/field-crypto");
  const { MANAGE_TOKEN_AAD, createCheckoutPaymentRequest } = await import(
    "@/lib/square/payments"
  );

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
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: parsed.data.guestPhone,
          guest_address: parsed.data.guestAddress,
        },
        dek,
      ),
      ...appointmentLookupWrite(ctx.organizationId, guestEmail, dek),
      privacy_accepted_at: new Date().toISOString(),
      guest_preferred_locale: preferredLocale,
      status: requiresPayment ? "pending_payment" : "confirmed",
      manage_token_hash: hashBookingToken(manageToken),
      manage_token_encrypted: encryptField(manageToken, MANAGE_TOKEN_AAD, dek),
      form_answers:
        serviceFields.length > 0
          ? encryptBookingFormAnswers(parsedAnswers.answers, dek)
          : null,
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

  if (ctx.serviceLinkId) {
    const claimed = await claimServiceLink({
      admin,
      linkId: ctx.serviceLinkId,
      organizationId: ctx.organizationId,
      appointmentId: appointment.id,
    });
    if (!claimed) {
      await admin
        .from("booking_appointments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", appointment.id);
      return { error: "already_used" };
    }
  }

  await recordBookingAbuseEvent({
    organizationId: ctx.organizationId,
    kind: "book_success",
    emailHash: hashes.emailHash,
    ipHash: hashes.ipHash,
  });

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.appointment.create",
    resourceType: "booking_appointment",
    resourceId: appointment.id,
    metadata: {
      serviceId: service.id,
      paymentRequired: requiresPayment,
      rateKind: priced.applied,
      amountCents,
    },
  });

  if (requiresPayment) {
    const allowPayLater = Boolean(service.allow_pay_later);
    try {
      const hoursUntilStart = Math.max(
        2,
        Math.ceil(
          (Date.parse(parsed.data.startsAt) - Date.now()) / 3_600_000,
        ),
      );
      const checkout = await createCheckoutPaymentRequest({
        organizationId: ctx.organizationId,
        source: "booking",
        amountCents,
        currency: service.currency || "CAD",
        description: `${localizedTitle} — ${ctx.organizationName}`,
        locale: preferredLocale,
        appointmentId: appointment.id,
        personId,
        buyerEmail: guestEmail,
        expiresInHours: allowPayLater ? hoursUntilStart : 2,
        expiresAt: allowPayLater ? new Date(parsed.data.startsAt) : null,
      });

      const origin = await getAppBaseUrl();
      const urls = bookingManageUrls(origin, preferredLocale, manageToken);
      const payUrl = `${origin.replace(/\/$/, "")}/${preferredLocale}/pay/${checkout.token}`;

      if (allowPayLater) {
        const { pushAppointmentToHostCalendars } = await import(
          "@/lib/calendar/host-calendar"
        );
        const calendar = await pushAppointmentToHostCalendars({
          organizationId: ctx.organizationId,
          hostUserId: host.userId,
          appointmentId: appointment.id,
          title: `${localizedTitle} — ${guestName}`,
          description: `Booked via ${product.name} (payment pending)\n${guestName}\n${guestEmail}\n${parsed.data.guestPhone}`,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
        });
        const meetJoinUrl = calendar.meetJoinUrl;

        after(async () => {
          const { sendBookingConfirmationEmail } = await import(
            "@/lib/email/booking-confirmation"
          );
          const { issueContractsForAppointment } = await import(
            "@/lib/contracts/issue"
          );
          await sendBookingConfirmationEmail({
            locale: preferredLocale,
            to: guestEmail,
            guestName,
            organizationName: ctx.organizationName,
            organizationId: ctx.organizationId,
            hostName: host.name,
            hostUserId: host.userId,
            appointmentId: appointment.id,
            serviceTitle: localizedTitle,
            startsAt: parsed.data.startsAt,
            timezone: ctx.settings.timezone,
            meetJoinUrl,
            manageUrl: urls.manageUrl,
            cancelUrl: urls.cancelUrl,
            payUrl,
            variant: "pending_payment",
          });
          await issueContractsForAppointment(appointment.id);
        });

        return {
          message: "choose_payment",
          appointmentId: appointment.id,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          serviceTitle: localizedTitle,
          hostName: host.name,
          meetJoinUrl: meetJoinUrl ?? undefined,
          manageToken,
          checkoutUrl: checkout.checkoutUrl,
          paymentToken: checkout.token,
        };
      }

      return {
        message: "payment_required",
        appointmentId: appointment.id,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        serviceTitle: localizedTitle,
        hostName: host.name,
        manageToken,
        checkoutUrl: checkout.checkoutUrl,
        paymentToken: checkout.token,
      };
    } catch (err) {
      console.error("booking payment link:", err);
      await admin
        .from("booking_appointments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", appointment.id);
      if (ctx.serviceLinkId) {
        await releaseServiceLink({
          admin,
          linkId: ctx.serviceLinkId,
          appointmentId: appointment.id,
        });
      }
      return { error: "payment_failed", guestEmail };
    }
  }

  const origin = await getAppBaseUrl();
  const urls = bookingManageUrls(origin, preferredLocale, manageToken);

  const { pushAppointmentToHostCalendars } = await import(
    "@/lib/calendar/host-calendar"
  );
  const calendar = await pushAppointmentToHostCalendars({
    organizationId: ctx.organizationId,
    hostUserId: host.userId,
    appointmentId: appointment.id,
    title: `${localizedTitle} — ${guestName}`,
    description: `Booked via ${product.name}\n${guestName}\n${guestEmail}\n${parsed.data.guestPhone}`,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });
  const meetJoinUrl = calendar.meetJoinUrl;

  after(async () => {
    const { sendBookingConfirmationEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    const { issueContractsForAppointment } = await import(
      "@/lib/contracts/issue"
    );
    await sendBookingConfirmationEmail({
      locale: preferredLocale,
      to: guestEmail,
      guestName,
      organizationName: ctx.organizationName,
      organizationId: ctx.organizationId,
      hostName: host.name,
      hostUserId: host.userId,
      appointmentId: appointment.id,
      serviceTitle: localizedTitle,
      startsAt: parsed.data.startsAt,
      timezone: ctx.settings.timezone,
      meetJoinUrl,
      manageUrl: urls.manageUrl,
      cancelUrl: urls.cancelUrl,
    });
    await issueContractsForAppointment(appointment.id);
  });

  return {
    message: "booked",
    appointmentId: appointment.id,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    serviceTitle: localizedTitle,
    hostName: host.name,
    meetJoinUrl: meetJoinUrl ?? undefined,
    manageToken,
  };
}

export async function sendPublicBookingManageLinksAction(
  _prev: ManageLinksState,
  formData: FormData,
): Promise<ManageLinksState> {
  const parsed = manageLinksSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    guestEmail: String(formData.get("guestEmail") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const ctx = await loadPublicBookingContext(parsed.data.token);
  if (!ctx) return { error: "unavailable" };

  const guestEmail = normalizeGuestEmail(parsed.data.guestEmail);
  const hashes = await bookingSubjectHashes(ctx.organizationId, guestEmail);
  const rate = await checkManageLinksRateLimit({
    organizationId: ctx.organizationId,
    emailHash: hashes.emailHash,
    ipHash: hashes.ipHash,
  });
  if (rate !== "ok") return { error: "cooldown" };

  await recordBookingAbuseEvent({
    organizationId: ctx.organizationId,
    kind: "manage_links",
    emailHash: hashes.emailHash,
    ipHash: hashes.ipHash,
  });

  const existing = await listFutureGuestAppointmentsByEmail({
    organizationId: ctx.organizationId,
    email: guestEmail,
    locale: parsed.data.locale,
  });
  if (existing.length === 0) {
    return { message: "links_sent" };
  }

  const admin = createServiceClient();
  const origin = await getAppBaseUrl();
  const appointments: {
    serviceTitle: string;
    hostName: string;
    startsAt: string;
    manageUrl: string;
    cancelUrl: string;
  }[] = [];
  for (const row of existing) {
    const manageToken = createBookingToken();
    const { error } = await admin
      .from("booking_appointments")
      .update({
        manage_token_hash: hashBookingToken(manageToken),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "confirmed");
    if (error) {
      console.error("rotate manage token:", error.message);
      continue;
    }
    const urls = bookingManageUrls(origin, parsed.data.locale, manageToken);
    appointments.push({
      serviceTitle: row.serviceTitle,
      hostName: row.hostName,
      startsAt: row.startsAt,
      manageUrl: urls.manageUrl,
      cancelUrl: urls.cancelUrl,
    });
  }

  const hostIds = [...new Set(existing.map((row) => row.hostUserId))];
  const uniqueHost = hostIds.length === 1 ? hostIds[0]! : null;

  after(async () => {
    const { sendBookingManageLinksEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    await sendBookingManageLinksEmail({
      locale: parsed.data.locale,
      to: guestEmail,
      guestName: existing[0]?.guestName || guestEmail,
      organizationName: ctx.organizationName,
      organizationId: ctx.organizationId,
      replyToUserId: uniqueHost,
      timezone: ctx.settings.timezone,
      appointments,
    });
  });

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.manage_links.send",
    resourceType: "booking_appointment",
    metadata: { count: appointments.length },
  });

  return { message: "links_sent" };
}

async function claimServiceLink(input: {
  admin: ReturnType<typeof createServiceClient>;
  linkId: string;
  organizationId: string;
  appointmentId: string;
}) {
  const { data, error } = await input.admin
    .from("booking_service_links")
    .update({ appointment_id: input.appointmentId })
    .eq("id", input.linkId)
    .eq("organization_id", input.organizationId)
    .is("appointment_id", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("claimServiceLink:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

async function releaseServiceLink(input: {
  admin: ReturnType<typeof createServiceClient>;
  linkId: string;
  appointmentId: string;
}) {
  const { error } = await input.admin
    .from("booking_service_links")
    .update({ appointment_id: null })
    .eq("id", input.linkId)
    .eq("appointment_id", input.appointmentId);
  if (error) console.error("releaseServiceLink:", error.message);
}
