"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  mergeMinuteRanges,
  minutesToPgTime,
  type MinuteRange,
} from "@/lib/booking/availability";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import {
  BOOKING_TIMEZONES,
  addDaysToIsoDate,
  isBookingTimezone,
  minutesFromHm,
  zonedCivilToUtc,
} from "@/lib/booking/timezone";
import { requireOrganizationId } from "@/lib/crm/queries";
import { recordAuditEvent } from "@/lib/security/audit";
import { PII_AAD } from "@/lib/security/client-pii";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

export type BookingActionState = {
  error?: string;
  message?: string;
  bookingUrl?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);
const weekdaySchema = z.coerce.number().int().min(0).max(6);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .transform((value) => value.slice(0, 5));

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

async function requireMember() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  return { ok: true as const, membership, user };
}

function revalidateBooking(locale: string) {
  revalidatePath(`/${locale}/calendar`);
  revalidatePath(`/${locale}/settings/calendar`);
}

function mintTokenPayload(orgId: string, dek: Buffer) {
  const token = createBookingToken();
  return {
    token,
    public_token_hash: hashBookingToken(token),
    public_token_encrypted: encryptField(token, PII_AAD.booking.token, dek),
  };
}

export async function ensureBookingSettingsAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("booking_settings")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (existing) return { message: "ok" };

  const dek = await getOrgDataKey(orgId);
  const minted = mintTokenPayload(orgId, dek);
  const { error } = await supabase.from("booking_settings").insert({
    organization_id: orgId,
    public_token_hash: minted.public_token_hash,
    public_token_encrypted: minted.public_token_encrypted,
  });
  if (error) {
    console.error("ensureBookingSettings:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "created" };
}

export async function copyBookingLinkAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const supabase = await createClient();
  const dek = await getOrgDataKey(orgId);
  let { data: settings, error } = await supabase
    .from("booking_settings")
    .select("public_token_encrypted")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("copyBookingLink read:", error.message);
    return { error: "save_failed" };
  }

  if (!settings) {
    const gate = await requireManager();
    if (!gate.ok) return { error: gate.error };
    const minted = mintTokenPayload(orgId, dek);
    const inserted = await supabase
      .from("booking_settings")
      .insert({
        organization_id: orgId,
        public_token_hash: minted.public_token_hash,
        public_token_encrypted: minted.public_token_encrypted,
      })
      .select("public_token_encrypted")
      .single();
    if (inserted.error || !inserted.data) {
      console.error("copyBookingLink insert:", inserted.error?.message);
      return { error: "save_failed" };
    }
    settings = inserted.data;
  }

  const encrypted = settings.public_token_encrypted as string | null;
  if (!encrypted) return { error: "save_failed" };

  let token: string;
  try {
    token = decryptField(encrypted, PII_AAD.booking.token, dek);
  } catch {
    return { error: "save_failed" };
  }

  const base = await getAppBaseUrl();
  const bookingUrl = `${base}/${parsedLocale.data}/book/${token}`;
  revalidateBooking(parsedLocale.data);
  return { message: "copied", bookingUrl };
}

export async function regenerateBookingLinkAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();

  const supabase = await createClient();
  const dek = await getOrgDataKey(orgId);
  const minted = mintTokenPayload(orgId, dek);

  const { data: existing } = await supabase
    .from("booking_settings")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("booking_settings")
      .update({
        public_token_hash: minted.public_token_hash,
        public_token_encrypted: minted.public_token_encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId);
    if (error) {
      console.error("regenerateBookingLink update:", error.message);
      return { error: "save_failed" };
    }
  } else {
    const { error } = await supabase.from("booking_settings").insert({
      organization_id: orgId,
      public_token_hash: minted.public_token_hash,
      public_token_encrypted: minted.public_token_encrypted,
    });
    if (error) {
      console.error("regenerateBookingLink insert:", error.message);
      return { error: "save_failed" };
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.link.regenerate",
    resourceType: "booking_settings",
    resourceId: orgId,
  });

  const base = await getAppBaseUrl();
  revalidateBooking(parsedLocale.data);
  return {
    message: "regenerated",
    bookingUrl: `${base}/${parsedLocale.data}/book/${minted.token}`,
  };
}

export async function saveBookingSettingsAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = z
    .object({
      locale: localeSchema,
      timezone: z.string(),
      bookingWindowDays: z.coerce.number().int().min(1).max(90),
      minNoticeHours: z.coerce.number().int().min(0).max(168),
      bufferMinutes: z.coerce.number().int().min(0).max(120),
      isEnabled: z.enum(["on", "true", "false"]).optional(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      timezone: String(formData.get("timezone") || ""),
      bookingWindowDays: formData.get("bookingWindowDays"),
      minNoticeHours: formData.get("minNoticeHours"),
      bufferMinutes: formData.get("bufferMinutes"),
      isEnabled: formData.get("isEnabled") ? "on" : "false",
    });

  if (!parsed.success || !isBookingTimezone(parsed.data.timezone)) {
    return { error: "invalid" };
  }
  if (!(BOOKING_TIMEZONES as readonly string[]).includes(parsed.data.timezone)) {
    return { error: "invalid" };
  }

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();
  const dek = await getOrgDataKey(orgId);

  const { data: existing } = await supabase
    .from("booking_settings")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();

  const payload = {
    timezone: parsed.data.timezone,
    booking_window_days: parsed.data.bookingWindowDays,
    min_notice_hours: parsed.data.minNoticeHours,
    buffer_minutes: parsed.data.bufferMinutes,
    is_enabled: parsed.data.isEnabled === "on",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("booking_settings")
      .update(payload)
      .eq("organization_id", orgId);
    if (error) {
      console.error("saveBookingSettings update:", error.message);
      return { error: "save_failed" };
    }
  } else {
    const minted = mintTokenPayload(orgId, dek);
    const { error } = await supabase.from("booking_settings").insert({
      organization_id: orgId,
      ...payload,
      public_token_hash: minted.public_token_hash,
      public_token_encrypted: minted.public_token_encrypted,
    });
    if (error) {
      console.error("saveBookingSettings insert:", error.message);
      return { error: "save_failed" };
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.settings.update",
    resourceType: "booking_settings",
    resourceId: orgId,
  });

  revalidateBooking(parsed.data.locale);
  return { message: "saved" };
}

export async function addAvailabilityRuleAction(
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const parsed = z
    .object({
      locale: localeSchema,
      weekday: weekdaySchema,
      startTime: timeSchema,
      endTime: timeSchema,
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      weekday: formData.get("weekday"),
      startTime: String(formData.get("startTime") || ""),
      endTime: String(formData.get("endTime") || ""),
    });
  if (!parsed.success) return { error: "invalid" };
  if (parsed.data.endTime <= parsed.data.startTime) return { error: "invalid_range" };

  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase.from("booking_availability_rules").insert({
    organization_id: orgId,
    user_id: gate.user.id,
    weekday: parsed.data.weekday,
    start_time: `${parsed.data.startTime}:00`,
    end_time: `${parsed.data.endTime}:00`,
  });
  if (error) {
    console.error("addAvailabilityRule:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsed.data.locale);
  return { message: "rule_added" };
}

async function replaceWeekdayHours(
  orgId: string,
  userId: string,
  weekday: number,
  ranges: MinuteRange[],
) {
  const supabase = await createClient();
  const merged = mergeMinuteRanges(ranges);
  const { error: deleteError } = await supabase
    .from("booking_availability_rules")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("weekday", weekday);
  if (deleteError) {
    console.error("replaceWeekdayHours delete:", deleteError.message);
    return false;
  }
  if (merged.length === 0) return true;
  const { error: insertError } = await supabase
    .from("booking_availability_rules")
    .insert(
      merged.map((range) => ({
        organization_id: orgId,
        user_id: userId,
        weekday,
        start_time: minutesToPgTime(range.start),
        end_time: minutesToPgTime(range.end),
      })),
    );
  if (insertError) {
    console.error("replaceWeekdayHours insert:", insertError.message);
    return false;
  }
  return true;
}

async function loadWeekdayRanges(
  orgId: string,
  userId: string,
  weekday: number,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_availability_rules")
    .select("start_time, end_time")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("weekday", weekday);
  if (error) {
    console.error("loadWeekdayRanges:", error.message);
    return null;
  }
  return (data ?? []).map((row) => ({
    start: minutesFromHm(String(row.start_time)),
    end: minutesFromHm(String(row.end_time)),
  }));
}

export async function addAvailabilityRangeAction(input: {
  locale: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}): Promise<BookingActionState> {
  const parsed = z
    .object({
      locale: localeSchema,
      weekday: weekdaySchema,
      startMinutes: z.number().int().min(0).max(24 * 60),
      endMinutes: z.number().int().min(0).max(24 * 60),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  if (parsed.data.endMinutes <= parsed.data.startMinutes) {
    return { error: "invalid_range" };
  }

  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const existing = await loadWeekdayRanges(
    orgId,
    gate.user.id,
    parsed.data.weekday,
  );
  if (!existing) return { error: "save_failed" };
  const ok = await replaceWeekdayHours(orgId, gate.user.id, parsed.data.weekday, [
    ...existing,
    { start: parsed.data.startMinutes, end: parsed.data.endMinutes },
  ]);
  if (!ok) return { error: "save_failed" };
  revalidateBooking(parsed.data.locale);
  return { message: "rule_added" };
}

export async function clearDayAvailabilityAction(
  weekday: number,
  locale: string,
): Promise<BookingActionState> {
  const parsed = z
    .object({ weekday: weekdaySchema, locale: localeSchema })
    .safeParse({ weekday, locale });
  if (!parsed.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const ok = await replaceWeekdayHours(
    gate.membership.organization.id,
    gate.user.id,
    parsed.data.weekday,
    [],
  );
  if (!ok) return { error: "save_failed" };
  revalidateBooking(parsed.data.locale);
  return { message: "day_cleared" };
}

export async function clearWeekAvailabilityAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_availability_rules")
    .delete()
    .eq("organization_id", gate.membership.organization.id)
    .eq("user_id", gate.user.id);
  if (error) {
    console.error("clearWeekAvailability:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "week_cleared" };
}

export async function applyWeekdayHoursPresetAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  for (const weekday of [1, 2, 3, 4, 5]) {
    const existing = await loadWeekdayRanges(orgId, gate.user.id, weekday);
    if (!existing) return { error: "save_failed" };
    const ok = await replaceWeekdayHours(orgId, gate.user.id, weekday, [
      ...existing,
      { start: 9 * 60, end: 17 * 60 },
    ]);
    if (!ok) return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "preset_applied" };
}

export async function deleteAvailabilityRuleAction(
  ruleId: string,
  locale: string,
): Promise<BookingActionState> {
  if (!z.string().uuid().safeParse(ruleId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_availability_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", orgId)
    .eq("user_id", gate.user.id);
  if (error) {
    console.error("deleteAvailabilityRule:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "rule_removed" };
}

export async function blockDayAction(
  dateIso: string,
  locale: string,
): Promise<BookingActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("timezone")
    .eq("organization_id", orgId)
    .maybeSingle();
  const timezone = settings?.timezone ?? "America/Toronto";
  const startsAt = zonedCivilToUtc(dateIso, "00:00", timezone);
  const endsAt = zonedCivilToUtc(addDaysToIsoDate(dateIso, 1), "00:00", timezone);

  const { error } = await supabase.from("booking_blocked_times").insert({
    organization_id: orgId,
    user_id: gate.user.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: gate.user.id,
  });
  if (error) {
    console.error("blockDay:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "day_blocked" };
}

const blockRangeSchema = z
  .object({
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMinutes: z.number().int().min(0).max(24 * 60 - 30),
    endMinutes: z.number().int().min(30).max(24 * 60),
    locale: localeSchema,
  })
  .refine((value) => value.endMinutes - value.startMinutes >= 30);

export async function blockRangeAction(input: {
  dateIso: string;
  startMinutes: number;
  endMinutes: number;
  locale: string;
}): Promise<BookingActionState> {
  const parsed = blockRangeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("timezone")
    .eq("organization_id", orgId)
    .maybeSingle();
  const timezone = settings?.timezone ?? "America/Toronto";
  const startHm = minutesToPgTime(parsed.data.startMinutes).slice(0, 5);
  const startsAt = zonedCivilToUtc(parsed.data.dateIso, startHm, timezone);
  const endsAt =
    parsed.data.endMinutes >= 24 * 60
      ? zonedCivilToUtc(
          addDaysToIsoDate(parsed.data.dateIso, 1),
          "00:00",
          timezone,
        )
      : zonedCivilToUtc(
          parsed.data.dateIso,
          minutesToPgTime(parsed.data.endMinutes).slice(0, 5),
          timezone,
        );
  if (endsAt.getTime() <= startsAt.getTime()) return { error: "invalid" };

  const { error } = await supabase.from("booking_blocked_times").insert({
    organization_id: orgId,
    user_id: gate.user.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: gate.user.id,
  });
  if (error) {
    console.error("blockRange:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsed.data.locale);
  return { message: "range_blocked" };
}

export async function unblockTimeAction(
  blockId: string,
  locale: string,
): Promise<BookingActionState> {
  if (!z.string().uuid().safeParse(blockId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_blocked_times")
    .delete()
    .eq("id", blockId)
    .eq("organization_id", orgId)
    .eq("user_id", gate.user.id);
  if (error) {
    console.error("unblockTime:", error.message);
    return { error: "save_failed" };
  }
  revalidateBooking(parsedLocale.data);
  return { message: "day_unblocked" };
}

export async function cancelAppointmentAction(
  appointmentId: string,
  locale: string,
): Promise<BookingActionState> {
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return { error: "invalid" };
  }
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();

  const { loadStaffAppointmentContext, resolvePublicBookingUrl } = await import(
    "@/lib/booking/queries"
  );
  const ctx = await loadStaffAppointmentContext(appointmentId);
  if (!ctx || ctx.organizationId !== orgId) return { error: "invalid" };
  if (ctx.status !== "confirmed" && ctx.status !== "pending_payment") {
    return { error: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
    .eq("organization_id", orgId)
    .in("status", ["confirmed", "pending_payment"]);
  if (error) {
    console.error("cancelAppointment:", error.message);
    return { error: "save_failed" };
  }

  const { voidOpenContractsForAppointment } = await import(
    "@/lib/contracts/issue"
  );
  await voidOpenContractsForAppointment(appointmentId);

  const { settlePaymentOnBookingCancel } = await import(
    "@/lib/square/payments"
  );
  const settlement = await settlePaymentOnBookingCancel({
    organizationId: orgId,
    appointmentId,
    startsAt: ctx.startsAt,
    reason: "Appointment cancelled by firm",
  });
  if (settlement.outcome === "failed") {
    console.error("cancelAppointment payment settlement failed", appointmentId);
  }

  const { toAppLocale } = await import("@/lib/i18n/locales");
  const emailLocale = toAppLocale(ctx.guestPreferredLocale || parsedLocale.data);
  const bookingUrl = await resolvePublicBookingUrl(ctx.settings, emailLocale);

  after(async () => {
    const { deleteAppointmentHostCalendarEvents } = await import(
      "@/lib/calendar/host-calendar"
    );
    const { sendBookingCancelledEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    await Promise.all([
      deleteAppointmentHostCalendarEvents({
        organizationId: orgId,
        hostUserId: ctx.hostUserId,
        googleEventId: ctx.googleEventId,
        microsoftEventId: ctx.microsoftEventId,
        conferenceId: ctx.conferenceId,
      }),
      sendBookingCancelledEmail({
        locale: emailLocale,
        to: ctx.guestEmail,
        guestName: ctx.guestName,
        organizationName: ctx.organizationName,
        hostName: ctx.hostName,
        serviceTitle: ctx.serviceTitle,
        startsAt: ctx.startsAt,
        timezone: ctx.settings.timezone,
        cancelledBy: "organization",
        bookingUrl,
      }),
    ]);
  });

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.appointment.cancel",
    resourceType: "booking_appointment",
    resourceId: appointmentId,
    metadata: {
      paymentSettlement: settlement.outcome,
    },
  });

  revalidateBooking(parsedLocale.data);
  return { message: "cancelled" };
}

export type RescheduleSlotOption = {
  startsAt: string;
  endsAt: string;
  dateIso: string;
};

export async function listAppointmentRescheduleSlotsAction(
  appointmentId: string,
): Promise<{ error?: string; slots?: RescheduleSlotOption[]; timezone?: string }> {
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return { error: "invalid" };
  }
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };

  const { loadStaffAppointmentContext } = await import("@/lib/booking/queries");
  const { generateServiceSlots } = await import("@/lib/booking/slots");
  const ctx = await loadStaffAppointmentContext(appointmentId);
  if (!ctx || ctx.organizationId !== gate.membership.organization.id) {
    return { error: "invalid" };
  }
  if (ctx.status !== "confirmed" && ctx.status !== "pending_payment") {
    return { error: "invalid", slots: [], timezone: ctx.settings.timezone };
  }
  if (!ctx.host) {
    return { error: "invalid", slots: [], timezone: ctx.settings.timezone };
  }

  const slots = generateServiceSlots({
    durationMinutes: ctx.durationMinutes,
    rules: ctx.host.rules,
    blocked: ctx.host.blocked,
    busy: ctx.host.busy,
    window: {
      timezone: ctx.settings.timezone,
      bookingWindowDays: ctx.settings.booking_window_days,
      // Staff can move sooner than the public notice window.
      minNoticeHours: 0,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  }).filter((slot) => slot.startsAt !== ctx.startsAt);

  return {
    slots: slots.map((slot) => ({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      dateIso: slot.dateIso,
    })),
    timezone: ctx.settings.timezone,
  };
}

export async function rescheduleAppointmentAction(input: {
  appointmentId: string;
  locale: string;
  startsAt: string;
  endsAt: string;
}): Promise<BookingActionState> {
  const parsed = z
    .object({
      appointmentId: z.string().uuid(),
      locale: localeSchema,
      startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
      endsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();

  const { loadStaffAppointmentContext } = await import("@/lib/booking/queries");
  const { isSlotStillOpen } = await import("@/lib/booking/slots");
  const { toAppLocale } = await import("@/lib/i18n/locales");

  const ctx = await loadStaffAppointmentContext(parsed.data.appointmentId);
  if (!ctx || ctx.organizationId !== orgId) return { error: "invalid" };
  if (
    (ctx.status !== "confirmed" && ctx.status !== "pending_payment") ||
    !ctx.host
  ) {
    return { error: "invalid" };
  }

  const expectedEnd = new Date(
    new Date(parsed.data.startsAt).getTime() + ctx.durationMinutes * 60_000,
  ).toISOString();
  if (expectedEnd !== parsed.data.endsAt) return { error: "slot_taken" };

  if (
    parsed.data.startsAt === ctx.startsAt &&
    parsed.data.endsAt === ctx.endsAt
  ) {
    return { message: "rescheduled" };
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
      minNoticeHours: 0,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  });
  if (!open) return { error: "slot_taken" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_appointments")
    .update({
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.appointmentId)
    .eq("organization_id", orgId)
    .in("status", ["confirmed", "pending_payment"]);
  if (error) {
    if (error.code === "23P01" || error.message.includes("no_overlap")) {
      return { error: "slot_taken" };
    }
    console.error("staff booking reschedule:", error.message);
    return { error: "save_failed" };
  }

  const emailLocale = toAppLocale(ctx.guestPreferredLocale || parsed.data.locale);

  after(async () => {
    const { updateAppointmentHostCalendarEvents } = await import(
      "@/lib/calendar/host-calendar"
    );
    const { sendBookingConfirmationEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    const calendar = await updateAppointmentHostCalendarEvents({
      organizationId: orgId,
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
      locale: emailLocale,
      to: ctx.guestEmail,
      guestName: ctx.guestName,
      organizationName: ctx.organizationName,
      hostName: ctx.hostName,
      serviceTitle: ctx.serviceTitle,
      startsAt: parsed.data.startsAt,
      timezone: ctx.settings.timezone,
      meetJoinUrl,
      variant: "updated",
    });
  });

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.appointment.reschedule",
    resourceType: "booking_appointment",
    resourceId: parsed.data.appointmentId,
  });

  revalidateBooking(parsed.data.locale);
  return { message: "rescheduled" };
}
