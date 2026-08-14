import { generateServiceSlots } from "@/lib/booking/slots";
import { hashBookingToken } from "@/lib/booking/token";
import { addDaysToIsoDate, zonedCivilToUtc } from "@/lib/booking/timezone";
import { getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId, type PersonRow } from "@/lib/crm/queries";
import {
  decryptBookingGuestRow,
  decryptPersonRow,
  PII_AAD,
} from "@/lib/security/client-pii";
import { decryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingServiceRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
} from "@/lib/booking/types";
import {
  getUserGoogleConnection,
  queryGoogleFreeBusy,
} from "@/lib/google/calendar";

export type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingServiceRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
};

export type PublicBookingContext = {
  organizationId: string;
  organizationName: string;
  settings: BookingSettingsRow;
  services: BookingServiceRow[];
  rules: BookingAvailabilityRuleRow[];
  blocked: BookingBlockedTimeRow[];
  busy: { starts_at: string; ends_at: string }[];
};

async function orgIdOrNull() {
  return requireOrganizationId();
}

export async function listBookingServices(): Promise<BookingServiceRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_services")
    .select("*")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listBookingServices:", error.message);
    return [];
  }
  return (data ?? []) as BookingServiceRow[];
}

export async function getBookingSettings(): Promise<BookingSettingsRow | null> {
  const orgId = await orgIdOrNull();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) {
    console.error("getBookingSettings:", error.message);
    return null;
  }
  return (data as BookingSettingsRow | null) ?? null;
}

export async function revealBookingToken(
  settings: BookingSettingsRow,
): Promise<string | null> {
  if (!settings.public_token_encrypted) return null;
  try {
    return decryptField(
      settings.public_token_encrypted,
      PII_AAD.booking.token,
      await getOrgDataKey(settings.organization_id),
    );
  } catch (error) {
    console.error("revealBookingToken:", error);
    return null;
  }
}

export async function listAvailabilityRules(): Promise<
  BookingAvailabilityRuleRow[]
> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_availability_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    console.error("listAvailabilityRules:", error.message);
    return [];
  }
  return (data ?? []) as BookingAvailabilityRuleRow[];
}

export async function listBlockedTimes(
  fromIso: string,
  toIso: string,
): Promise<BookingBlockedTimeRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_blocked_times")
    .select("*")
    .eq("organization_id", orgId)
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("listBlockedTimes:", error.message);
    return [];
  }
  return (data ?? []) as BookingBlockedTimeRow[];
}

export async function listAppointmentsInRange(
  fromIso: string,
  toIso: string,
): Promise<BookingAppointmentRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const key = await getOrgDataKey(orgId);
  const { data, error } = await supabase
    .from("booking_appointments")
    .select("*, service:booking_services(*)")
    .eq("organization_id", orgId)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("listAppointmentsInRange:", error.message);
    return [];
  }
  return ((data ?? []) as BookingAppointmentRow[]).map((row) =>
    decryptBookingGuestRow(row, key),
  );
}

export async function loadPublicBookingContext(
  token: string,
): Promise<PublicBookingContext | null> {
  const admin = createServiceClient();
  const hash = hashBookingToken(token);
  const { data: settings, error } = await admin
    .from("booking_settings")
    .select("*")
    .eq("public_token_hash", hash)
    .maybeSingle();
  if (error || !settings) {
    if (error) console.error("loadPublicBookingContext settings:", error.message);
    return null;
  }
  const row = settings as BookingSettingsRow;
  if (!row.is_enabled) return null;

  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", row.organization_id)
    .maybeSingle();
  if (!org) return null;

  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + (row.booking_window_days + 1) * 86_400_000,
  );

  const hostUserId = row.default_host_user_id;
  const hostConnection = hostUserId
    ? await getUserGoogleConnection(row.organization_id, hostUserId)
    : null;

  const [servicesRes, rulesRes, blockedRes, busyRes, googleBusyRes] =
    await Promise.all([
    admin
      .from("booking_services")
      .select("*")
      .eq("organization_id", row.organization_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("booking_availability_rules")
      .select("*")
      .eq("organization_id", row.organization_id)
      .order("weekday", { ascending: true }),
    admin
      .from("booking_blocked_times")
      .select("*")
      .eq("organization_id", row.organization_id)
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", now.toISOString()),
    admin
      .from("booking_appointments")
      .select("starts_at, ends_at")
      .eq("organization_id", row.organization_id)
      .eq("status", "confirmed")
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", now.toISOString()),
    hostConnection
      ? admin
          .from("booking_google_busy")
          .select("starts_at, ends_at")
          .eq("organization_id", row.organization_id)
          .eq("connection_id", hostConnection.id)
          .lt("starts_at", windowEnd.toISOString())
          .gt("ends_at", now.toISOString())
      : Promise.resolve({ data: [] as { starts_at: string; ends_at: string }[] }),
  ]);

  const busy = [
    ...((busyRes.data ?? []) as { starts_at: string; ends_at: string }[]),
    ...((googleBusyRes.data ?? []) as { starts_at: string; ends_at: string }[]),
  ];

  try {
    if (hostConnection) {
      const live = await queryGoogleFreeBusy({
        connectionId: hostConnection.id,
        calendarId: hostConnection.calendar_id,
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
      });
      busy.push(...live);
    }
  } catch (error) {
    console.error("public booking google freeBusy:", error);
  }

  return {
    organizationId: org.id as string,
    organizationName: org.name as string,
    settings: row,
    services: (servicesRes.data ?? []) as BookingServiceRow[],
    rules: (rulesRes.data ?? []) as BookingAvailabilityRuleRow[],
    blocked: (blockedRes.data ?? []) as BookingBlockedTimeRow[],
    busy,
  };
}

export function publicSlotsForService(
  ctx: PublicBookingContext,
  service: BookingServiceRow,
) {
  return generateServiceSlots({
    durationMinutes: service.duration_minutes,
    rules: ctx.rules,
    blocked: ctx.blocked,
    busy: ctx.busy,
    window: {
      timezone: ctx.settings.timezone,
      bookingWindowDays: ctx.settings.booking_window_days,
      minNoticeHours: ctx.settings.min_notice_hours,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  });
}

export function dayBoundsUtc(dateIso: string, timeZone: string) {
  const start = zonedCivilToUtc(dateIso, "00:00", timeZone);
  const end = zonedCivilToUtc(addDaysToIsoDate(dateIso, 1), "00:00", timeZone);
  return { start, end };
}

export async function listGoogleBusy(
  fromIso: string,
  toIso: string,
): Promise<BookingGoogleBusyRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_google_busy")
    .select("*")
    .eq("organization_id", orgId)
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("listGoogleBusy:", error.message);
    return [];
  }
  return (data ?? []) as BookingGoogleBusyRow[];
}

export async function getMyGoogleCalendarConnection(): Promise<GoogleCalendarConnectionPublic | null> {
  const orgId = await orgIdOrNull();
  const user = await getSessionUser();
  if (!orgId || !user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("user_id, google_email, last_synced_at, is_enabled")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getMyGoogleCalendarConnection:", error.message);
    return null;
  }
  return (data as GoogleCalendarConnectionPublic | null) ?? null;
}

export async function listGoogleCalendarConnections(): Promise<
  GoogleCalendarConnectionPublic[]
> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("user_id, google_email, last_synced_at, is_enabled")
    .eq("organization_id", orgId)
    .eq("is_enabled", true);
  if (error) {
    console.error("listGoogleCalendarConnections:", error.message);
    return [];
  }
  return (data ?? []) as GoogleCalendarConnectionPublic[];
}

export async function findPersonByEmail(
  organizationId: string,
  email: string,
): Promise<PersonRow | null> {
  const admin = createServiceClient();
  const key = await getOrgDataKey(organizationId);
  const { data, error } = await admin
    .from("people")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(500);
  if (error) {
    console.error("findPersonByEmail:", error.message);
    return null;
  }
  const needle = email.trim().toLowerCase();
  for (const row of (data ?? []) as PersonRow[]) {
    const person = decryptPersonRow(row, key);
    if ((person.email ?? "").trim().toLowerCase() === needle) {
      return person;
    }
  }
  return null;
}

