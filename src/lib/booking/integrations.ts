import { createServiceClient } from "@/lib/supabase/admin";

export const SETTINGS_CALENDAR_PATH = "/settings/account";

export function calendarSettingsHref(
  locale: string,
  query?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  const hash = qs ? "#calendar" : "";
  return `/${locale}${SETTINGS_CALENDAR_PATH}${qs ? `?${qs}` : ""}${hash}`;
}

export type CalendarProvider = "google" | "microsoft";
export type MeetingProvider = "google_meet" | "teams" | "zoom";
export type IntegrationIntent = "calendar" | "meetings";
export type MeetingVendor = CalendarProvider | "zoom";

export type StaffBookingIntegrations = {
  organization_id: string;
  user_id: string;
  calendar_provider: CalendarProvider | null;
  meeting_provider: MeetingProvider | null;
};

export function parseIntegrationIntent(value: unknown): IntegrationIntent {
  return value === "meetings" ? "meetings" : "calendar";
}

export function matchingMeetingProvider(
  calendar: CalendarProvider,
): MeetingProvider {
  return calendar === "google" ? "google_meet" : "teams";
}

export function vendorForMeetingProvider(
  meeting: MeetingProvider,
): MeetingVendor {
  if (meeting === "google_meet") return "google";
  if (meeting === "teams") return "microsoft";
  return "zoom";
}

function admin() {
  return createServiceClient();
}

export async function getStaffBookingIntegrations(
  organizationId: string,
  userId: string,
): Promise<StaffBookingIntegrations | null> {
  const { data, error } = await admin()
    .from("staff_booking_integrations")
    .select("organization_id, user_id, calendar_provider, meeting_provider")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("getStaffBookingIntegrations:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    organization_id: data.organization_id as string,
    user_id: data.user_id as string,
    calendar_provider: (data.calendar_provider as CalendarProvider | null) ?? null,
    meeting_provider: (data.meeting_provider as MeetingProvider | null) ?? null,
  };
}

export async function listCalendarProviderUserIds(
  organizationId: string,
  provider: CalendarProvider,
): Promise<string[]> {
  const { data, error } = await admin()
    .from("staff_booking_integrations")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("calendar_provider", provider);
  if (error) {
    console.error("listCalendarProviderUserIds:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.user_id as string);
}

async function upsertIntegrations(
  organizationId: string,
  userId: string,
  patch: {
    calendar_provider?: CalendarProvider | null;
    meeting_provider?: MeetingProvider | null;
  },
) {
  const current = await getStaffBookingIntegrations(organizationId, userId);
  const next = {
    organization_id: organizationId,
    user_id: userId,
    calendar_provider: Object.prototype.hasOwnProperty.call(
      patch,
      "calendar_provider",
    )
      ? (patch.calendar_provider ?? null)
      : (current?.calendar_provider ?? null),
    meeting_provider: Object.prototype.hasOwnProperty.call(
      patch,
      "meeting_provider",
    )
      ? (patch.meeting_provider ?? null)
      : (current?.meeting_provider ?? null),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin()
    .from("staff_booking_integrations")
    .upsert(next, { onConflict: "organization_id,user_id" });
  if (error) {
    console.error("upsert staff_booking_integrations:", error.message);
    throw new Error("integrations_save_failed");
  }
  return next;
}

export async function applyIntegrationIntent(input: {
  organizationId: string;
  userId: string;
  vendor: CalendarProvider;
  intent: IntegrationIntent;
}) {
  const current = await getStaffBookingIntegrations(
    input.organizationId,
    input.userId,
  );
  if (input.intent === "calendar") {
    const meeting =
      current?.meeting_provider ?? matchingMeetingProvider(input.vendor);
    await upsertIntegrations(input.organizationId, input.userId, {
      calendar_provider: input.vendor,
      meeting_provider: meeting,
    });
    return { calendarChangedFrom: current?.calendar_provider ?? null };
  }
  await upsertIntegrations(input.organizationId, input.userId, {
    meeting_provider: matchingMeetingProvider(input.vendor),
  });
  return { calendarChangedFrom: current?.calendar_provider ?? null };
}

export async function applyMeetingProvider(input: {
  organizationId: string;
  userId: string;
  meeting: MeetingProvider;
}) {
  await upsertIntegrations(input.organizationId, input.userId, {
    meeting_provider: input.meeting,
  });
}

export async function clearCalendarProvider(
  organizationId: string,
  userId: string,
) {
  await upsertIntegrations(organizationId, userId, {
    calendar_provider: null,
  });
}

export async function clearMeetingProvider(
  organizationId: string,
  userId: string,
) {
  await upsertIntegrations(organizationId, userId, {
    meeting_provider: null,
  });
}

export function vendorStillNeeded(
  integrations: StaffBookingIntegrations | null,
  vendor: CalendarProvider,
) {
  if (!integrations) return false;
  if (integrations.calendar_provider === vendor) return true;
  if (
    integrations.meeting_provider &&
    vendorForMeetingProvider(integrations.meeting_provider) === vendor
  ) {
    return true;
  }
  return false;
}

export function zoomStillNeeded(integrations: StaffBookingIntegrations | null) {
  return integrations?.meeting_provider === "zoom";
}

export async function mapOrgCalendarProviders(
  organizationId: string,
): Promise<Map<string, CalendarProvider | null>> {
  const { data, error } = await admin()
    .from("staff_booking_integrations")
    .select("user_id, calendar_provider")
    .eq("organization_id", organizationId);
  const map = new Map<string, CalendarProvider | null>();
  if (error) {
    console.error("mapOrgCalendarProviders:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    map.set(
      row.user_id as string,
      (row.calendar_provider as CalendarProvider | null) ?? null,
    );
  }
  return map;
}

export async function mapAllCalendarProviders(): Promise<
  Map<string, CalendarProvider | null>
> {
  const { data, error } = await admin()
    .from("staff_booking_integrations")
    .select("organization_id, user_id, calendar_provider");
  const map = new Map<string, CalendarProvider | null>();
  if (error) {
    console.error("mapAllCalendarProviders:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    map.set(
      `${row.organization_id as string}:${row.user_id as string}`,
      (row.calendar_provider as CalendarProvider | null) ?? null,
    );
  }
  return map;
}

export function isActiveCalendarVendor(
  userId: string,
  vendor: CalendarProvider,
  providers: Map<string, CalendarProvider | null>,
) {
  if (!providers.has(userId)) return true;
  return providers.get(userId) === vendor;
}
