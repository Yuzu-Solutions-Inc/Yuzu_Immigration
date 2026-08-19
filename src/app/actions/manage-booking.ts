"use server";

import { after } from "next/server";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import { loadManageBookingContext } from "@/lib/booking/queries";
import { isSlotStillOpen } from "@/lib/booking/slots";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";

export type ManageBookingState = {
  error?: string;
  message?: string;
  startsAt?: string;
  meetJoinUrl?: string;
};

const tokenSchema = z.string().min(16).max(200);
const localeSchema = z.enum(["en", "fr", "es"]);

const rescheduleSchema = z.object({
  token: tokenSchema,
  locale: localeSchema,
  startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  endsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});

const cancelSchema = z.object({
  token: tokenSchema,
  locale: localeSchema,
  confirm: z.literal("on"),
});

function manageError(
  status: string,
  startsAt: string,
): ManageBookingState | null {
  if (status === "cancelled") return { error: "already_cancelled" };
  if (Date.parse(startsAt) <= Date.now()) return { error: "too_late" };
  if (status !== "confirmed") return { error: "unavailable" };
  return null;
}

export async function reschedulePublicBookingAction(
  _prev: ManageBookingState,
  formData: FormData,
): Promise<ManageBookingState> {
  const parsed = rescheduleSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    startsAt: String(formData.get("startsAt") || ""),
    endsAt: String(formData.get("endsAt") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const ctx = await loadManageBookingContext(parsed.data.token);
  if (!ctx) return { error: "unavailable" };

  const blocked = manageError(ctx.status, ctx.startsAt);
  if (blocked) return blocked;
  if (!ctx.host) return { error: "unavailable" };

  const expectedEnd = new Date(
    new Date(parsed.data.startsAt).getTime() + ctx.durationMinutes * 60_000,
  ).toISOString();
  if (expectedEnd !== parsed.data.endsAt) return { error: "slot_taken" };

  if (
    parsed.data.startsAt === ctx.startsAt &&
    parsed.data.endsAt === ctx.endsAt
  ) {
    return {
      message: "rescheduled",
      startsAt: ctx.startsAt,
      meetJoinUrl: ctx.meetJoinUrl ?? undefined,
    };
  }

  const open = isSlotStillOpen({
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    durationMinutes: ctx.durationMinutes,
    rules: ctx.host.rules,
    blocked: ctx.host.blocked,
    busy: ctx.host.busy,
    window: {
      timezone: ctx.settings.timezone,
      bookingWindowDays: ctx.settings.booking_window_days,
      minNoticeHours: ctx.settings.min_notice_hours,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  });
  if (!open) return { error: "slot_taken" };

  const admin = createServiceClient();
  const { error } = await admin
    .from("booking_appointments")
    .update({
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.appointmentId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "confirmed");
  if (error) {
    if (error.code === "23P01" || error.message.includes("no_overlap")) {
      return { error: "slot_taken" };
    }
    console.error("public booking reschedule:", error.message);
    return { error: "save_failed" };
  }

  const origin = await getAppBaseUrl();
  const urls = bookingManageUrls(
    origin,
    parsed.data.locale,
    parsed.data.token,
  );

  after(async () => {
    const { updateAppointmentHostCalendarEvents } = await import(
      "@/lib/calendar/host-calendar"
    );
    const { sendBookingConfirmationEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    const calendar = await updateAppointmentHostCalendarEvents({
      organizationId: ctx.organizationId,
      hostUserId: ctx.hostUserId,
      appointmentId: ctx.appointmentId,
      googleEventId: ctx.googleEventId,
      microsoftEventId: ctx.microsoftEventId,
      conferenceId: ctx.conferenceId,
      title: `${ctx.serviceTitle} — ${ctx.guestName}`,
      description: `Booked via ${product.name}\n${ctx.guestName}\n${ctx.guestEmail}`,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      location: ctx.meetJoinUrl ?? undefined,
    });
    const meetJoinUrl = calendar.meetJoinUrl ?? ctx.meetJoinUrl;
    await sendBookingConfirmationEmail({
      locale: parsed.data.locale,
      to: ctx.guestEmail,
      guestName: ctx.guestName,
      organizationName: ctx.organizationName,
      hostName: ctx.hostName,
      serviceTitle: ctx.serviceTitle,
      startsAt: parsed.data.startsAt,
      timezone: ctx.settings.timezone,
      meetJoinUrl,
      manageUrl: urls.manageUrl,
      cancelUrl: urls.cancelUrl,
      variant: "updated",
    });
  });

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.appointment.reschedule",
    resourceType: "booking_appointment",
    resourceId: ctx.appointmentId,
  });

  return {
    message: "rescheduled",
    startsAt: parsed.data.startsAt,
    meetJoinUrl: ctx.meetJoinUrl ?? undefined,
  };
}

export async function cancelPublicBookingAction(
  _prev: ManageBookingState,
  formData: FormData,
): Promise<ManageBookingState> {
  const parsed = cancelSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    confirm: formData.get("confirm") === "on" ? "on" : "",
  });
  if (!parsed.success) return { error: "invalid" };

  const ctx = await loadManageBookingContext(parsed.data.token);
  if (!ctx) return { error: "unavailable" };
  if (ctx.status === "cancelled") return { message: "cancelled" };

  const blocked = manageError(ctx.status, ctx.startsAt);
  if (blocked) return blocked;

  const { resolveCancelRefundTier, normalizeSquareCancelRefundPolicy } =
    await import("@/lib/square/cancel-policy");
  const tier = ctx.cancelPolicy
    ? resolveCancelRefundTier(
        normalizeSquareCancelRefundPolicy({
          cancel_refund_enabled: ctx.cancelPolicy.refundEnabled,
          cancel_free_days_before: ctx.cancelPolicy.freeDaysBefore,
          cancel_min_days_before: ctx.cancelPolicy.feeDaysBefore,
          cancel_refund_fee_type: ctx.cancelPolicy.feeType,
          cancel_refund_fee_cents: ctx.cancelPolicy.feeCents,
          cancel_refund_fee_percent: ctx.cancelPolicy.feePercent,
        }),
        ctx.startsAt,
      )
    : "free";
  if (tier === "blocked") {
    return { error: "cancel_window" };
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from("booking_appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.appointmentId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "confirmed");
  if (error) {
    console.error("public booking cancel:", error.message);
    return { error: "save_failed" };
  }

  const { voidOpenContractsForAppointment } = await import(
    "@/lib/contracts/issue"
  );
  await voidOpenContractsForAppointment(ctx.appointmentId);

  const { settlePaymentOnBookingCancel } = await import(
    "@/lib/square/payments"
  );
  const settlement = await settlePaymentOnBookingCancel({
    organizationId: ctx.organizationId,
    appointmentId: ctx.appointmentId,
    startsAt: ctx.startsAt,
    reason: "Appointment cancelled by guest",
  });
  if (settlement.outcome === "failed") {
    console.error(
      "public booking cancel payment settlement failed",
      ctx.appointmentId,
    );
  }

  after(async () => {
    const { deleteAppointmentHostCalendarEvents } = await import(
      "@/lib/calendar/host-calendar"
    );
    const { sendBookingCancelledEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    await Promise.all([
      deleteAppointmentHostCalendarEvents({
        organizationId: ctx.organizationId,
        hostUserId: ctx.hostUserId,
        googleEventId: ctx.googleEventId,
        microsoftEventId: ctx.microsoftEventId,
        conferenceId: ctx.conferenceId,
      }),
      sendBookingCancelledEmail({
        locale: parsed.data.locale,
        to: ctx.guestEmail,
        guestName: ctx.guestName,
        organizationName: ctx.organizationName,
        hostName: ctx.hostName,
        serviceTitle: ctx.serviceTitle,
        startsAt: ctx.startsAt,
        timezone: ctx.settings.timezone,
      }),
    ]);
  });

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.appointment.cancel",
    resourceType: "booking_appointment",
    resourceId: ctx.appointmentId,
    metadata: {
      paymentSettlement: settlement.outcome,
    },
  });

  return { message: "cancelled" };
}
