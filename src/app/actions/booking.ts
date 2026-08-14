"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import {
  BOOKING_TIMEZONES,
  addDaysToIsoDate,
  isBookingTimezone,
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
  revalidatePath(`/${parsedLocale.data}/calendar`);
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
  revalidatePath(`/${parsedLocale.data}/calendar`);
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
  revalidatePath(`/${parsedLocale.data}/calendar`);
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

  revalidatePath(`/${parsed.data.locale}/calendar`);
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

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase.from("booking_availability_rules").insert({
    organization_id: orgId,
    weekday: parsed.data.weekday,
    start_time: `${parsed.data.startTime}:00`,
    end_time: `${parsed.data.endTime}:00`,
  });
  if (error) {
    console.error("addAvailabilityRule:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: "rule_added" };
}

export async function applyWeekdayHoursPresetAction(
  locale: string,
): Promise<BookingActionState> {
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const rows = [1, 2, 3, 4, 5].map((weekday) => ({
    organization_id: orgId,
    weekday,
    start_time: "09:00:00",
    end_time: "17:00:00",
  }));
  const { error } = await supabase
    .from("booking_availability_rules")
    .upsert(rows, {
      onConflict: "organization_id,weekday,start_time,end_time",
      ignoreDuplicates: true,
    });
  if (error) {
    console.error("applyWeekdayHoursPreset:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "preset_applied" };
}

export async function deleteAvailabilityRuleAction(
  ruleId: string,
  locale: string,
): Promise<BookingActionState> {
  if (!z.string().uuid().safeParse(ruleId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_availability_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("deleteAvailabilityRule:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "rule_removed" };
}

export async function blockDayAction(
  dateIso: string,
  locale: string,
): Promise<BookingActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();

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
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: user?.id ?? null,
  });
  if (error) {
    console.error("blockDay:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "day_blocked" };
}

export async function unblockTimeAction(
  blockId: string,
  locale: string,
): Promise<BookingActionState> {
  if (!z.string().uuid().safeParse(blockId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;

  const supabase = await createClient();
  const { error } = await supabase
    .from("booking_blocked_times")
    .delete()
    .eq("id", blockId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("unblockTime:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${parsedLocale.data}/calendar`);
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

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("booking_appointments")
    .select("google_event_id")
    .eq("id", appointmentId)
    .eq("organization_id", orgId)
    .maybeSingle();

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
    .eq("status", "confirmed");
  if (error) {
    console.error("cancelAppointment:", error.message);
    return { error: "save_failed" };
  }

  const googleEventId = existing?.google_event_id as string | null;
  if (googleEventId) {
    after(async () => {
      const { deleteAppointmentGoogleEvent } = await import(
        "@/lib/google/calendar"
      );
      await deleteAppointmentGoogleEvent({
        organizationId: orgId,
        googleEventId,
      });
    });
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.appointment.cancel",
    resourceType: "booking_appointment",
    resourceId: appointmentId,
  });

  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "cancelled" };
}
