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
  ManageBookingPayload,
  PublicHostCalendar,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";
import {
  queryGoogleFreeBusy,
} from "@/lib/google/calendar";
import { getGoogleCalendarSecrets } from "@/lib/google/secrets";

export type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingServiceRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
  ManageBookingPayload,
  PublicHostCalendar,
  ServiceEmailAutomationRow,
};

export type PublicBookingContext = {
  organizationId: string;
  organizationName: string;
  settings: BookingSettingsRow;
  services: BookingServiceRow[];
  hosts: PublicHostCalendar[];
};

export type ManageBookingContext = {
  organizationId: string;
  organizationName: string;
  settings: BookingSettingsRow;
  appointmentId: string;
  status: BookingAppointmentRow["status"];
  guestName: string;
  guestEmail: string;
  hostUserId: string;
  hostName: string;
  serviceId: string;
  serviceTitle: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  meetJoinUrl: string | null;
  googleEventId: string | null;
  host: PublicHostCalendar | null;
};

function sameBusyRange(
  a: { starts_at: string; ends_at: string },
  b: { starts_at: string; ends_at: string },
) {
  return (
    Date.parse(a.starts_at) === Date.parse(b.starts_at) &&
    Date.parse(a.ends_at) === Date.parse(b.ends_at)
  );
}

async function loadHostCalendars(input: {
  organizationId: string;
  bookingWindowDays: number;
  excludeAppointmentId?: string;
  excludeBusyRange?: { starts_at: string; ends_at: string };
}): Promise<PublicHostCalendar[]> {
  const admin = createServiceClient();
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + (input.bookingWindowDays + 1) * 86_400_000,
  );

  const [rulesRes, blockedRes, busyRes, connectionsRes] = await Promise.all([
    admin
      .from("booking_availability_rules")
      .select("*")
      .eq("organization_id", input.organizationId)
      .order("weekday", { ascending: true }),
    admin
      .from("booking_blocked_times")
      .select("*")
      .eq("organization_id", input.organizationId)
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", now.toISOString()),
    admin
      .from("booking_appointments")
      .select("id, starts_at, ends_at, host_user_id")
      .eq("organization_id", input.organizationId)
      .eq("status", "confirmed")
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", now.toISOString()),
    admin
      .from("google_calendar_connections")
      .select("id, user_id, calendar_id, is_enabled")
      .eq("organization_id", input.organizationId)
      .eq("is_enabled", true),
  ]);

  const rules = (rulesRes.data ?? []) as BookingAvailabilityRuleRow[];
  const { data: memberRows } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", input.organizationId);
  const memberIds = new Set(
    (memberRows ?? []).map((member) => member.user_id as string),
  );
  const hostIds = [
    ...new Set(
      rules
        .map((rule) => rule.user_id)
        .filter((userId) => memberIds.has(userId)),
    ),
  ];
  if (hostIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", hostIds);
  const nameById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id as string,
      (profile.full_name as string | null)?.trim() ||
        (profile.email as string | null) ||
        (profile.id as string),
    ]),
  );

  const connections = (connectionsRes.data ?? []) as {
    id: string;
    user_id: string;
    calendar_id: string;
    is_enabled: boolean;
  }[];
  const connectionByUser = new Map(
    connections.map((connection) => [connection.user_id, connection]),
  );
  const connectionIds = connections.map((connection) => connection.id);
  const { data: googleBusyRows } =
    connectionIds.length > 0
      ? await admin
          .from("booking_google_busy")
          .select("connection_id, starts_at, ends_at")
          .eq("organization_id", input.organizationId)
          .in("connection_id", connectionIds)
          .lt("starts_at", windowEnd.toISOString())
          .gt("ends_at", now.toISOString())
      : { data: [] as { connection_id: string; starts_at: string; ends_at: string }[] };

  const googleBusyByConnection = new Map<
    string,
    { starts_at: string; ends_at: string }[]
  >();
  for (const busy of googleBusyRows ?? []) {
    const interval = { starts_at: busy.starts_at, ends_at: busy.ends_at };
    if (
      input.excludeBusyRange &&
      sameBusyRange(interval, input.excludeBusyRange)
    ) {
      continue;
    }
    const list = googleBusyByConnection.get(busy.connection_id) ?? [];
    list.push(interval);
    googleBusyByConnection.set(busy.connection_id, list);
  }

  const liveBusyByUser = new Map<string, { starts_at: string; ends_at: string }[]>();
  await Promise.all(
    hostIds.map(async (hostId) => {
      const connection = connectionByUser.get(hostId);
      if (!connection) return;
      try {
        const live = await queryGoogleFreeBusy({
          connectionId: connection.id,
          calendarId: connection.calendar_id,
          timeMin: now.toISOString(),
          timeMax: windowEnd.toISOString(),
        });
        liveBusyByUser.set(
          hostId,
          input.excludeBusyRange
            ? live.filter(
                (interval) => !sameBusyRange(interval, input.excludeBusyRange!),
              )
            : live,
        );
      } catch (error) {
        console.error("public booking google freeBusy:", error);
      }
    }),
  );

  const blocked = (blockedRes.data ?? []) as BookingBlockedTimeRow[];
  const appointments = (busyRes.data ?? []) as {
    id: string;
    starts_at: string;
    ends_at: string;
    host_user_id: string;
  }[];

  return hostIds.map((hostId) => {
    const connection = connectionByUser.get(hostId);
    const googleBusy = connection
      ? (googleBusyByConnection.get(connection.id) ?? [])
      : [];
    return {
      userId: hostId,
      name: nameById.get(hostId) ?? hostId,
      rules: rules
        .filter((rule) => rule.user_id === hostId)
        .map((rule) => ({
          weekday: rule.weekday,
          start_time: rule.start_time,
          end_time: rule.end_time,
        })),
      blocked: blocked
        .filter((item) => item.user_id === hostId)
        .map((item) => ({
          starts_at: item.starts_at,
          ends_at: item.ends_at,
        })),
      busy: [
        ...appointments
          .filter(
            (item) =>
              item.host_user_id === hostId &&
              item.id !== input.excludeAppointmentId,
          )
          .map((item) => ({
            starts_at: item.starts_at,
            ends_at: item.ends_at,
          })),
        ...googleBusy,
        ...(liveBusyByUser.get(hostId) ?? []),
      ],
    };
  });
}

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

export async function listServiceEmailAutomations(): Promise<
  ServiceEmailAutomationRow[]
> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_service_email_automations")
    .select("*")
    .eq("organization_id", orgId)
    .order("days_before", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listServiceEmailAutomations:", error.message);
    return [];
  }
  return (data ?? []) as ServiceEmailAutomationRow[];
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
  const user = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("booking_availability_rules")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
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
  const user = await getSessionUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("booking_blocked_times")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
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

  const [servicesRes, hosts] = await Promise.all([
    admin
      .from("booking_services")
      .select("*")
      .eq("organization_id", row.organization_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadHostCalendars({
      organizationId: row.organization_id,
      bookingWindowDays: row.booking_window_days,
    }),
  ]);

  return {
    organizationId: org.id as string,
    organizationName: org.name as string,
    settings: row,
    services: (servicesRes.data ?? []) as BookingServiceRow[],
    hosts,
  };
}

export async function loadManageBookingContext(
  token: string,
): Promise<ManageBookingContext | null> {
  const admin = createServiceClient();
  const hash = hashBookingToken(token);
  const { data: appointment, error } = await admin
    .from("booking_appointments")
    .select("*")
    .eq("manage_token_hash", hash)
    .maybeSingle();
  if (error || !appointment) {
    if (error) console.error("loadManageBookingContext:", error.message);
    return null;
  }

  const row = appointment as BookingAppointmentRow;
  const dek = await getOrgDataKey(row.organization_id);
  const guest = decryptBookingGuestRow(row, dek);

  const [{ data: org }, { data: settings }, { data: service }, { data: profile }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, name")
        .eq("id", row.organization_id)
        .maybeSingle(),
      admin
        .from("booking_settings")
        .select("*")
        .eq("organization_id", row.organization_id)
        .maybeSingle(),
      admin
        .from("booking_services")
        .select("id, title, duration_minutes")
        .eq("id", row.service_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", row.host_user_id)
        .maybeSingle(),
    ]);
  if (!org || !settings || !service) return null;

  const settingsRow = settings as BookingSettingsRow;
  const canManage =
    row.status === "confirmed" && Date.parse(row.starts_at) > Date.now();
  const hosts = canManage
    ? await loadHostCalendars({
        organizationId: row.organization_id,
        bookingWindowDays: settingsRow.booking_window_days,
        excludeAppointmentId: row.id,
        excludeBusyRange: {
          starts_at: row.starts_at,
          ends_at: row.ends_at,
        },
      })
    : [];
  const host = hosts.find((item) => item.userId === row.host_user_id) ?? null;
  const hostName =
    host?.name ||
    (profile?.full_name as string | null)?.trim() ||
    (profile?.email as string | null) ||
    row.host_user_id;

  return {
    organizationId: org.id as string,
    organizationName: org.name as string,
    settings: settingsRow,
    appointmentId: row.id,
    status: row.status,
    guestName: guest.guest_name,
    guestEmail: guest.guest_email,
    hostUserId: row.host_user_id,
    hostName,
    serviceId: row.service_id,
    serviceTitle: service.title as string,
    durationMinutes: service.duration_minutes as number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    meetJoinUrl: row.meet_join_url,
    googleEventId: row.google_event_id,
    host,
  };
}

export function toManageBookingPayload(
  token: string,
  ctx: ManageBookingContext,
): ManageBookingPayload {
  return {
    token,
    organizationName: ctx.organizationName,
    timezone: ctx.settings.timezone,
    bookingWindowDays: ctx.settings.booking_window_days,
    minNoticeHours: ctx.settings.min_notice_hours,
    bufferMinutes: ctx.settings.buffer_minutes,
    guestName: ctx.guestName,
    hostName: ctx.hostName,
    serviceTitle: ctx.serviceTitle,
    durationMinutes: ctx.durationMinutes,
    startsAt: ctx.startsAt,
    endsAt: ctx.endsAt,
    status: ctx.status,
    meetJoinUrl: ctx.meetJoinUrl,
    canManage:
      ctx.status === "confirmed" && Date.parse(ctx.startsAt) > Date.now(),
    host: ctx.host,
  };
}

export function publicSlotsForService(
  host: PublicHostCalendar,
  service: BookingServiceRow,
  settings: BookingSettingsRow,
) {
  return generateServiceSlots({
    durationMinutes: service.duration_minutes,
    rules: host.rules,
    blocked: host.blocked,
    busy: host.busy,
    window: {
      timezone: settings.timezone,
      bookingWindowDays: settings.booking_window_days,
      minNoticeHours: settings.min_notice_hours,
      bufferMinutes: settings.buffer_minutes,
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
  const user = await getSessionUser();
  if (!orgId || !user) return [];
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("google_calendar_connections")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return [];
  const { data, error } = await supabase
    .from("booking_google_busy")
    .select("*")
    .eq("organization_id", orgId)
    .eq("connection_id", connection.id)
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
    .select("id, user_id, google_email, last_synced_at, is_enabled")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getMyGoogleCalendarConnection:", error.message);
    return null;
  }
  if (!data?.is_enabled) return null;
  const secrets = await getGoogleCalendarSecrets(data.id as string);
  if (!secrets) return null;
  return {
    user_id: data.user_id as string,
    google_email: data.google_email as string | null,
    last_synced_at: data.last_synced_at as string | null,
    is_enabled: data.is_enabled as boolean,
  };
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

export type FutureGuestAppointmentMatch = {
  id: string;
  startsAt: string;
  guestName: string;
  guestEmail: string;
  serviceTitle: string;
  hostName: string;
  meetJoinUrl: string | null;
};

export async function listFutureGuestAppointmentsByEmail(input: {
  organizationId: string;
  email: string;
}): Promise<FutureGuestAppointmentMatch[]> {
  const admin = createServiceClient();
  const key = await getOrgDataKey(input.organizationId);
  const needle = input.email.trim().toLowerCase();
  const { data, error } = await admin
    .from("booking_appointments")
    .select(
      "id, starts_at, guest_name, guest_email, service_id, host_user_id, meet_join_url, status",
    )
    .eq("organization_id", input.organizationId)
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);
  if (error) {
    console.error("listFutureGuestAppointmentsByEmail:", error.message);
    return [];
  }

  const matched: {
    id: string;
    startsAt: string;
    guestName: string;
    guestEmail: string;
    serviceId: string;
    hostUserId: string;
    meetJoinUrl: string | null;
  }[] = [];
  for (const row of data ?? []) {
    const guest = decryptBookingGuestRow(
      {
        guest_name: row.guest_name as string,
        guest_email: row.guest_email as string,
      },
      key,
    );
    if ((guest.guest_email ?? "").trim().toLowerCase() !== needle) continue;
    matched.push({
      id: row.id as string,
      startsAt: row.starts_at as string,
      guestName: guest.guest_name,
      guestEmail: guest.guest_email,
      serviceId: row.service_id as string,
      hostUserId: row.host_user_id as string,
      meetJoinUrl: (row.meet_join_url as string | null) ?? null,
    });
  }
  if (matched.length === 0) return [];

  const serviceIds = [...new Set(matched.map((row) => row.serviceId))];
  const hostIds = [...new Set(matched.map((row) => row.hostUserId))];
  const [{ data: services }, { data: profiles }] = await Promise.all([
    admin.from("booking_services").select("id, title").in("id", serviceIds),
    admin.from("profiles").select("id, full_name, email").in("id", hostIds),
  ]);
  const serviceTitle = new Map(
    (services ?? []).map((row) => [row.id as string, row.title as string]),
  );
  const hostName = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        row.id,
    ]),
  );

  return matched.map((row) => ({
    id: row.id,
    startsAt: row.startsAt,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    serviceTitle: serviceTitle.get(row.serviceId) ?? "Service",
    hostName: hostName.get(row.hostUserId) ?? row.hostUserId,
    meetJoinUrl: row.meetJoinUrl,
  }));
}

