import { normalizeDayOffsets } from "@/lib/booking/day-offsets";
import { generateServiceSlots } from "@/lib/booking/slots";
import { hashBookingToken } from "@/lib/booking/token";
import type { BookingRateKind } from "@/lib/booking/pricing";
import { addDaysToIsoDate, zonedCivilToUtc } from "@/lib/booking/timezone";
import { getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId, type PersonRow } from "@/lib/crm/queries";
import {
  decryptBookingFormAnswers,
  decryptBookingGuestRow,
  decryptPersonRow,
  decryptProjectRow,
  PII_AAD,
} from "@/lib/security/client-pii";
import { decryptOrgRow } from "@/lib/security/encrypted-fields";
import { decryptProfileRow } from "@/lib/security/profile-pii";
import { decryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getStaffBookingIntegrations,
  isActiveCalendarVendor,
  mapOrgCalendarProviders,
} from "@/lib/booking/integrations";
import { serviceTitle } from "@/lib/booking/service-i18n";
import {
  resolveCancelRefundTier,
  normalizeSquareCancelRefundPolicy,
  toCancelPolicyDisplay,
  type CancelPolicyDisplay,
} from "@/lib/square/cancel-policy";
import type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingMicrosoftBusyRow,
  BookingFormRow,
  BookingFormFieldRow,
  BookingServiceRow,
  BookingServiceFormFieldRow,
  BookingSettingsRow,
  GoogleCalendarConnectionPublic,
  MicrosoftCalendarConnectionPublic,
  ZoomConnectionPublic,
  ManageBookingPayload,
  PublicHostCalendar,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";
import { parseAutomationTranslations } from "@/lib/email/automation-template";
import {
  queryGoogleFreeBusy,
} from "@/lib/google/calendar";
import { getGoogleCalendarSecrets } from "@/lib/google/secrets";
import { queryMicrosoftFreeBusy } from "@/lib/microsoft/calendar";
import { getMicrosoftCalendarSecrets } from "@/lib/microsoft/secrets";
import { getZoomSecrets } from "@/lib/zoom/secrets";

export type {
  BookingAppointmentRow,
  BookingAvailabilityRuleRow,
  BookingBlockedTimeRow,
  BookingGoogleBusyRow,
  BookingMicrosoftBusyRow,
  BookingFormRow,
  BookingFormFieldRow,
  BookingServiceRow,
  BookingSettingsRow,
  BookingServiceFormFieldRow,
  GoogleCalendarConnectionPublic,
  MicrosoftCalendarConnectionPublic,
  ZoomConnectionPublic,
  ManageBookingPayload,
  PublicHostCalendar,
  ServiceEmailAutomationRow,
};

export type PublicBookingSlotMode = "availability" | "unblocked";

export type PublicBookingContext = {
  organizationId: string;
  organizationName: string;
  settings: BookingSettingsRow;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  hosts: PublicHostCalendar[];
  cancelPolicy: CancelPolicyDisplay | null;
  slotMode: PublicBookingSlotMode;
  rateKind: BookingRateKind;
  serviceLinkId: string | null;
};

export type BookingPageLoad =
  | { status: "ok"; ctx: PublicBookingContext }
  | { status: "used" }
  | { status: "expired" }
  | { status: "missing" };

export type ManageBookingContext = {
  organizationId: string;
  organizationName: string;
  settings: BookingSettingsRow;
  appointmentId: string;
  status: BookingAppointmentRow["status"];
  guestName: string;
  guestEmail: string;
  guestPreferredLocale: string | null;
  hostUserId: string;
  hostName: string;
  serviceId: string;
  serviceTitle: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  meetJoinUrl: string | null;
  googleEventId: string | null;
  microsoftEventId: string | null;
  conferenceId: string | null;
  host: PublicHostCalendar | null;
  paymentStatus: string | null;
  paymentAmountCents: number | null;
  paymentCurrency: string | null;
  cancelPolicy: CancelPolicyDisplay | null;
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
  includeAllMembers?: boolean;
  hostUserId?: string | null;
}): Promise<PublicHostCalendar[]> {
  const admin = createServiceClient();
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + (input.bookingWindowDays + 1) * 86_400_000,
  );

  const [rulesRes, blockedRes, busyRes, connectionsRes, microsoftRes, calendarProviders] =
    await Promise.all([
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
      .in("status", ["confirmed", "pending_payment"])
      .lt("starts_at", windowEnd.toISOString())
      .gt("ends_at", now.toISOString()),
    admin
      .from("google_calendar_connections")
      .select("id, user_id, calendar_id, is_enabled")
      .eq("organization_id", input.organizationId)
      .eq("is_enabled", true),
    admin
      .from("microsoft_calendar_connections")
      .select("id, user_id, microsoft_email, is_enabled")
      .eq("organization_id", input.organizationId)
      .eq("is_enabled", true),
    mapOrgCalendarProviders(input.organizationId),
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
      input.hostUserId
        ? memberIds.has(input.hostUserId)
          ? [input.hostUserId]
          : []
        : input.includeAllMembers
          ? [...memberIds]
          : rules
              .map((rule) => rule.user_id)
              .filter((userId) => memberIds.has(userId)),
    ),
  ];
  if (hostIds.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", hostIds);
  const orgKey = await getOrgDataKey(input.organizationId);
  const nameById = new Map(
    (profiles ?? []).map((profile) => {
      const opened = decryptProfileRow(profile);
      return [
        opened.id as string,
        opened.full_name?.trim() || opened.email || (opened.id as string),
      ];
    }),
  );

  const connections = ((connectionsRes.data ?? []) as {
    id: string;
    user_id: string;
    calendar_id: string;
    is_enabled: boolean;
  }[]).filter((connection) =>
    isActiveCalendarVendor(connection.user_id, "google", calendarProviders),
  );
  const microsoftConnections = (
    (microsoftRes.data ?? []) as {
      id: string;
      user_id: string;
      microsoft_email: string | null;
      is_enabled: boolean;
    }[]
  )
    .map((connection) =>
      decryptOrgRow("microsoft_calendar_connections", connection, orgKey),
    )
    .filter((connection) =>
      isActiveCalendarVendor(connection.user_id, "microsoft", calendarProviders),
    );
  const connectionByUser = new Map(
    connections.map((connection) => [connection.user_id, connection]),
  );
  const microsoftByUser = new Map(
    microsoftConnections.map((connection) => [connection.user_id, connection]),
  );
  const connectionIds = connections.map((connection) => connection.id);
  const microsoftConnectionIds = microsoftConnections.map(
    (connection) => connection.id,
  );
  const [{ data: googleBusyRows }, { data: microsoftBusyRows }] =
    await Promise.all([
      connectionIds.length > 0
        ? admin
            .from("booking_google_busy")
            .select("connection_id, starts_at, ends_at")
            .eq("organization_id", input.organizationId)
            .in("connection_id", connectionIds)
            .lt("starts_at", windowEnd.toISOString())
            .gt("ends_at", now.toISOString())
        : Promise.resolve({
            data: [] as {
              connection_id: string;
              starts_at: string;
              ends_at: string;
            }[],
          }),
      microsoftConnectionIds.length > 0
        ? admin
            .from("booking_microsoft_busy")
            .select("connection_id, starts_at, ends_at")
            .eq("organization_id", input.organizationId)
            .in("connection_id", microsoftConnectionIds)
            .lt("starts_at", windowEnd.toISOString())
            .gt("ends_at", now.toISOString())
        : Promise.resolve({
            data: [] as {
              connection_id: string;
              starts_at: string;
              ends_at: string;
            }[],
          }),
    ]);

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

  const microsoftBusyByConnection = new Map<
    string,
    { starts_at: string; ends_at: string }[]
  >();
  for (const busy of microsoftBusyRows ?? []) {
    const interval = { starts_at: busy.starts_at, ends_at: busy.ends_at };
    if (
      input.excludeBusyRange &&
      sameBusyRange(interval, input.excludeBusyRange)
    ) {
      continue;
    }
    const list = microsoftBusyByConnection.get(busy.connection_id) ?? [];
    list.push(interval);
    microsoftBusyByConnection.set(busy.connection_id, list);
  }

  const liveBusyByUser = new Map<string, { starts_at: string; ends_at: string }[]>();
  function addLiveBusy(
    hostId: string,
    live: { starts_at: string; ends_at: string }[],
  ) {
    const filtered = input.excludeBusyRange
      ? live.filter(
          (interval) => !sameBusyRange(interval, input.excludeBusyRange!),
        )
      : live;
    const existing = liveBusyByUser.get(hostId) ?? [];
    liveBusyByUser.set(hostId, [...existing, ...filtered]);
  }
  await Promise.all(
    hostIds.map(async (hostId) => {
      const connection = connectionByUser.get(hostId);
      const microsoft = microsoftByUser.get(hostId);
      await Promise.all([
        connection
          ? queryGoogleFreeBusy({
              connectionId: connection.id,
              calendarId: connection.calendar_id,
              timeMin: now.toISOString(),
              timeMax: windowEnd.toISOString(),
            })
              .then((live) => addLiveBusy(hostId, live))
              .catch((error) => {
                console.error("public booking google freeBusy:", error);
              })
          : Promise.resolve(),
        microsoft
          ? queryMicrosoftFreeBusy({
              connectionId: microsoft.id,
              email: microsoft.microsoft_email,
              timeMin: now.toISOString(),
              timeMax: windowEnd.toISOString(),
            })
              .then((live) => addLiveBusy(hostId, live))
              .catch((error) => {
                console.error("public booking microsoft freeBusy:", error);
              })
          : Promise.resolve(),
      ]);
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
    const microsoft = microsoftByUser.get(hostId);
    const googleBusy = connection
      ? (googleBusyByConnection.get(connection.id) ?? [])
      : [];
    const microsoftBusy = microsoft
      ? (microsoftBusyByConnection.get(microsoft.id) ?? [])
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
        ...microsoftBusy,
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
  return ((data ?? []) as BookingServiceRow[]).map((row) => ({
    ...row,
    urgent_price_cents: row.urgent_price_cents ?? null,
    urgent_auto_within_days: row.urgent_auto_within_days ?? null,
  }));
}

export async function listBookingForms(): Promise<BookingFormRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_forms")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listBookingForms:", error.message);
    return [];
  }
  return (data ?? []) as BookingFormRow[];
}

export async function listServiceEmailAutomations(): Promise<
  ServiceEmailAutomationRow[]
> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const [{ data, error }, linksRes] = await Promise.all([
    supabase
      .from("booking_service_email_automations")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("booking_email_automation_services")
      .select("automation_id, service_id")
      .eq("organization_id", orgId),
  ]);
  if (error) {
    console.error("listServiceEmailAutomations:", error.message);
    return [];
  }
  if (linksRes.error) {
    console.error("listAutomationServices:", linksRes.error.message);
  }
  const serviceIdsByAutomation = new Map<string, string[]>();
  for (const link of linksRes.data ?? []) {
    const list = serviceIdsByAutomation.get(link.automation_id) ?? [];
    list.push(link.service_id);
    serviceIdsByAutomation.set(link.automation_id, list);
  }
  return ((data ?? []) as Omit<ServiceEmailAutomationRow, "service_ids">[]).map(
    (row) => ({
      ...row,
      days_before: normalizeDayOffsets(row.days_before),
      translations: parseAutomationTranslations(row.translations),
      service_ids: serviceIdsByAutomation.get(row.id) ?? [],
    }),
  );
}

export async function listServiceFormFields(): Promise<BookingFormFieldRow[]> {
  const orgId = await orgIdOrNull();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_service_form_fields")
    .select("*")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listServiceFormFields:", error.message);
    return [];
  }
  return (data ?? []) as BookingFormFieldRow[];
}

export async function getBookingSettings(): Promise<BookingSettingsRow | null> {
  const orgId = await orgIdOrNull();
  if (!orgId) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
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
  return ((data ?? []) as BookingAppointmentRow[]).map((row) => {
    const guest = decryptBookingGuestRow(row, key);
    return {
      ...guest,
      form_answers: decryptBookingFormAnswers(row.form_answers, key),
    };
  });
}

export async function loadPublicBookingContext(
  token: string,
): Promise<PublicBookingContext | null> {
  const loaded = await loadBookingPage(token);
  return loaded.status === "ok" ? loaded.ctx : null;
}

export async function loadBookingPage(token: string): Promise<BookingPageLoad> {
  const admin = createServiceClient();
  const hash = hashBookingToken(token);

  const linkLoad = await loadServiceLinkBookingPage(admin, hash);
  if (linkLoad) return linkLoad;

  const { data: settings, error } = await admin
    .from("booking_settings")
    .select("*")
    .eq("public_token_hash", hash)
    .maybeSingle();
  if (error) {
    console.error("loadPublicBookingContext settings:", error.message);
    return { status: "missing" };
  }
  if (!settings) return { status: "missing" };
  const row = settings as BookingSettingsRow;
  if (!row.is_enabled) return { status: "missing" };

  const ctx = await buildPublicBookingContext({
    organizationId: row.organization_id,
    settings: row,
    servicesFilter: { activeOnly: true },
    includeAllMembers: false,
    hostUserId: row.user_id,
    slotMode: "availability",
    rateKind: "standard",
    serviceLinkId: null,
  });
  return ctx ? { status: "ok", ctx } : { status: "missing" };
}

async function loadServiceLinkBookingPage(
  admin: ReturnType<typeof createServiceClient>,
  tokenHash: string,
): Promise<BookingPageLoad | null> {
  const { data: link, error } = await admin
    .from("booking_service_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("loadServiceLinkBookingPage:", error.message);
    return { status: "missing" };
  }
  if (!link) {
    await admin
      .from("booking_service_links")
      .delete()
      .lt("expires_at", new Date().toISOString());
    return null;
  }

  if (link.appointment_id) return { status: "used" };
  if (Date.parse(link.expires_at as string) <= Date.now()) {
    await admin.from("booking_service_links").delete().eq("id", link.id);
    return { status: "expired" };
  }

  const preferredHostId = (link.created_by as string | null) ?? null;
  const settingsQuery = admin
    .from("booking_settings")
    .select("*")
    .eq("organization_id", link.organization_id);
  const { data: settings } = preferredHostId
    ? await settingsQuery.eq("user_id", preferredHostId).maybeSingle()
    : await settingsQuery.limit(1).maybeSingle();
  if (!settings) return { status: "missing" };
  const settingsRow = settings as BookingSettingsRow;
  const hostUserId = preferredHostId ?? settingsRow.user_id;

  const rateKind =
    link.rate_kind === "urgent" ? "urgent" : "standard";
  const ctx = await buildPublicBookingContext({
    organizationId: link.organization_id as string,
    settings: settingsRow,
    servicesFilter: { serviceId: link.service_id as string },
    includeAllMembers: false,
    hostUserId,
    slotMode: "unblocked",
    rateKind,
    serviceLinkId: link.id as string,
  });
  return ctx ? { status: "ok", ctx } : { status: "missing" };
}

async function buildPublicBookingContext(input: {
  organizationId: string;
  settings: BookingSettingsRow;
  servicesFilter: { activeOnly: true } | { serviceId: string };
  includeAllMembers: boolean;
  hostUserId?: string | null;
  slotMode: PublicBookingSlotMode;
  rateKind: BookingRateKind;
  serviceLinkId: string | null;
}): Promise<PublicBookingContext | null> {
  const admin = createServiceClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", input.organizationId)
    .maybeSingle();
  if (!org) return null;

  let servicesQuery = admin
    .from("booking_services")
    .select("*")
    .eq("organization_id", input.organizationId);
  if ("activeOnly" in input.servicesFilter) {
    servicesQuery = servicesQuery.eq("is_active", true);
  } else {
    servicesQuery = servicesQuery.eq("id", input.servicesFilter.serviceId);
  }

  const [servicesRes, fieldsRes, hosts, squareRes, stripeRes] = await Promise.all([
    servicesQuery
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("booking_service_form_fields")
      .select("*")
      .eq("organization_id", input.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadHostCalendars({
      organizationId: input.organizationId,
      bookingWindowDays: input.settings.booking_window_days,
      includeAllMembers: input.includeAllMembers,
      hostUserId: input.hostUserId,
    }),
    admin
      .from("square_connections")
      .select(
        "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
      )
      .eq("organization_id", input.organizationId)
      .eq("is_enabled", true)
      .maybeSingle(),
    admin
      .from("stripe_connections")
      .select(
        "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
      )
      .eq("organization_id", input.organizationId)
      .eq("is_enabled", true)
      .maybeSingle(),
  ]);

  const services = ((servicesRes.data ?? []) as BookingServiceRow[]).map(
    (row) => ({
      ...row,
      urgent_price_cents: row.urgent_price_cents ?? null,
      urgent_auto_within_days: row.urgent_auto_within_days ?? null,
    }),
  );
  if (services.length === 0) return null;

  return {
    organizationId: org.id as string,
    organizationName: org.name as string,
    settings: input.settings,
    services,
    formFields: (fieldsRes.data ?? []) as BookingFormFieldRow[],
    hosts,
    cancelPolicy: (stripeRes.data ?? squareRes.data)
      ? toCancelPolicyDisplay(
          normalizeSquareCancelRefundPolicy(stripeRes.data ?? squareRes.data),
        )
      : null,
    slotMode: input.slotMode,
    rateKind: input.rateKind,
    serviceLinkId: input.serviceLinkId,
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

  const [{ data: org }, { data: settings }, { data: service }, { data: profile }, { data: payment }, { data: square }, { data: stripe }] =
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
        .eq("user_id", row.host_user_id)
        .maybeSingle(),
      admin
        .from("booking_services")
        .select("id, title, translations, duration_minutes")
        .eq("id", row.service_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", row.host_user_id)
        .maybeSingle(),
      admin
        .from("payment_requests")
        .select("status, amount_cents, currency")
        .eq("appointment_id", row.id)
        .eq("source", "booking")
        .maybeSingle(),
      admin
        .from("square_connections")
        .select(
          "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
        )
        .eq("organization_id", row.organization_id)
        .eq("is_enabled", true)
        .maybeSingle(),
      admin
        .from("stripe_connections")
        .select(
          "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
        )
        .eq("organization_id", row.organization_id)
        .eq("is_enabled", true)
        .maybeSingle(),
    ]);
  if (!org || !settings || !service) return null;

  const settingsRow = settings as BookingSettingsRow;
  const cancelPolicy = (stripe ?? square)
    ? toCancelPolicyDisplay(normalizeSquareCancelRefundPolicy(stripe ?? square))
    : null;
  const canManage =
    row.status === "confirmed" && Date.parse(row.starts_at) > Date.now();
  const hosts = canManage
    ? await loadHostCalendars({
        organizationId: row.organization_id,
        bookingWindowDays: settingsRow.booking_window_days,
        hostUserId: row.host_user_id,
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
    guestPreferredLocale: row.guest_preferred_locale,
    hostUserId: row.host_user_id,
    hostName,
    serviceId: row.service_id,
    serviceTitle: serviceTitle(service, row.guest_preferred_locale),
    durationMinutes: service.duration_minutes as number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    meetJoinUrl: row.meet_join_url,
    googleEventId: row.google_event_id,
    microsoftEventId: row.microsoft_event_id,
    conferenceId: row.conference_id ?? null,
    host,
    paymentStatus: (payment?.status as string | null) ?? null,
    paymentAmountCents:
      typeof payment?.amount_cents === "number" ? payment.amount_cents : null,
    paymentCurrency: (payment?.currency as string | null) ?? null,
    cancelPolicy,
  };
}

/**
 * Staff-side appointment context for cancel/reschedule emails and slot picking.
 * Excludes this appointment from busy so the current slot can be re-chosen.
 */
export async function loadStaffAppointmentContext(
  appointmentId: string,
): Promise<ManageBookingContext | null> {
  const orgId = await orgIdOrNull();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data: appointment, error } = await supabase
    .from("booking_appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error || !appointment) {
    if (error) console.error("loadStaffAppointmentContext:", error.message);
    return null;
  }

  const row = appointment as BookingAppointmentRow;
  const dek = await getOrgDataKey(orgId);
  const guest = decryptBookingGuestRow(row, dek);

  const [{ data: org }, { data: settings }, { data: service }, { data: profile }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, default_locale")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("booking_settings")
        .select("*")
        .eq("organization_id", orgId)
        .eq("user_id", row.host_user_id)
        .maybeSingle(),
      supabase
        .from("booking_services")
        .select("id, title, translations, duration_minutes")
        .eq("id", row.service_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", row.host_user_id)
        .maybeSingle(),
    ]);
  if (!org || !settings || !service) return null;

  const settingsRow = settings as BookingSettingsRow;
  const hosts = await loadHostCalendars({
    organizationId: orgId,
    bookingWindowDays: settingsRow.booking_window_days,
    hostUserId: row.host_user_id,
    excludeAppointmentId: row.id,
    excludeBusyRange: {
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    },
  });
  const host = hosts.find((item) => item.userId === row.host_user_id) ?? null;
  const hostName =
    host?.name ||
    (profile?.full_name as string | null)?.trim() ||
    (profile?.email as string | null) ||
    row.host_user_id;

  return {
    organizationId: orgId,
    organizationName: org.name as string,
    settings: settingsRow,
    appointmentId: row.id,
    status: row.status,
    guestName: guest.guest_name,
    guestEmail: guest.guest_email,
    guestPreferredLocale:
      row.guest_preferred_locale ||
      (org.default_locale as string | null) ||
      null,
    hostUserId: row.host_user_id,
    hostName,
    serviceId: row.service_id,
    serviceTitle: serviceTitle(service, row.guest_preferred_locale, org.default_locale as string | null),
    durationMinutes: service.duration_minutes as number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    meetJoinUrl: row.meet_join_url,
    googleEventId: row.google_event_id,
    microsoftEventId: row.microsoft_event_id,
    conferenceId: row.conference_id ?? null,
    host,
    paymentStatus: null,
    paymentAmountCents: null,
    paymentCurrency: null,
    cancelPolicy: null,
  };
}

export async function resolvePublicBookingUrl(
  settings: BookingSettingsRow,
  locale: string,
): Promise<string | null> {
  const token = await revealBookingToken(settings);
  if (!token) return null;
  const { getAppBaseUrl } = await import("@/lib/app-url");
  const base = await getAppBaseUrl();
  return `${base.replace(/\/$/, "")}/${locale}/book/${token}`;
}

export function toManageBookingPayload(
  token: string,
  ctx: ManageBookingContext,
): ManageBookingPayload {
  const future =
    ctx.status === "confirmed" && Date.parse(ctx.startsAt) > Date.now();
  const cancelTier = ctx.cancelPolicy
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
  const withinCancelWindow = cancelTier !== "blocked";
  let cancelBlockedReason: ManageBookingPayload["cancelBlockedReason"] = null;
  if (!future) cancelBlockedReason = "too_late";
  else if (!withinCancelWindow) cancelBlockedReason = "cancel_window";

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
    canManage: future,
    canCancel: future && withinCancelWindow,
    cancelBlockedReason,
    host: ctx.host,
    paymentStatus: ctx.paymentStatus,
    paymentAmountCents: ctx.paymentAmountCents,
    paymentCurrency: ctx.paymentCurrency,
    cancelPolicy: ctx.cancelPolicy,
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
  const integrations = await getStaffBookingIntegrations(orgId, user.id);
  if (integrations && integrations.calendar_provider !== "google") return [];
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
  const opened = decryptOrgRow(
    "google_calendar_connections",
    data,
    await getOrgDataKey(orgId),
  );
  return {
    user_id: opened.user_id as string,
    google_email: opened.google_email as string | null,
    last_synced_at: data.last_synced_at as string | null,
    is_enabled: data.is_enabled as boolean,
  };
}

export async function listMicrosoftBusy(
  fromIso: string,
  toIso: string,
): Promise<BookingMicrosoftBusyRow[]> {
  const orgId = await orgIdOrNull();
  const user = await getSessionUser();
  if (!orgId || !user) return [];
  const integrations = await getStaffBookingIntegrations(orgId, user.id);
  if (integrations && integrations.calendar_provider !== "microsoft") return [];
  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("microsoft_calendar_connections")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) return [];
  const { data, error } = await supabase
    .from("booking_microsoft_busy")
    .select("*")
    .eq("organization_id", orgId)
    .eq("connection_id", connection.id)
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso)
    .order("starts_at", { ascending: true });
  if (error) {
    console.error("listMicrosoftBusy:", error.message);
    return [];
  }
  return (data ?? []) as BookingMicrosoftBusyRow[];
}

export async function getMyMicrosoftCalendarConnection(): Promise<MicrosoftCalendarConnectionPublic | null> {
  const orgId = await orgIdOrNull();
  const user = await getSessionUser();
  if (!orgId || !user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("microsoft_calendar_connections")
    .select("id, user_id, microsoft_email, last_synced_at, is_enabled")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getMyMicrosoftCalendarConnection:", error.message);
    return null;
  }
  if (!data?.is_enabled) return null;
  const secrets = await getMicrosoftCalendarSecrets(data.id as string);
  if (!secrets) return null;
  const opened = decryptOrgRow(
    "microsoft_calendar_connections",
    data,
    await getOrgDataKey(orgId),
  );
  return {
    user_id: opened.user_id as string,
    microsoft_email: opened.microsoft_email as string | null,
    last_synced_at: data.last_synced_at as string | null,
    is_enabled: data.is_enabled as boolean,
  };
}

export async function getMyZoomConnection(): Promise<ZoomConnectionPublic | null> {
  const orgId = await orgIdOrNull();
  const user = await getSessionUser();
  if (!orgId || !user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("zoom_connections")
    .select("id, user_id, zoom_email, is_enabled")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("getMyZoomConnection:", error.message);
    return null;
  }
  if (!data?.is_enabled) return null;
  const secrets = await getZoomSecrets(data.id as string);
  if (!secrets) return null;
  const opened = decryptOrgRow(
    "zoom_connections",
    data,
    await getOrgDataKey(orgId),
  );
  return {
    user_id: opened.user_id as string,
    zoom_email: opened.zoom_email as string | null,
    is_enabled: data.is_enabled as boolean,
  };
}

export async function findPersonByEmail(
  organizationId: string,
  email: string,
): Promise<PersonRow | null> {
  const admin = createServiceClient();
  const key = await getOrgDataKey(organizationId);
  const { hashEmailLookup } = await import("@/lib/security/email-lookup");
  const { data, error } = await admin
    .from("people")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("email_lookup_hash", hashEmailLookup(organizationId, email, key))
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("findPersonByEmail:", error.message);
    return null;
  }
  return data ? decryptPersonRow(data as PersonRow, key) : null;
}

export type FutureGuestAppointmentMatch = {
  id: string;
  startsAt: string;
  guestName: string;
  guestEmail: string;
  serviceTitle: string;
  hostName: string;
  hostUserId: string;
  meetJoinUrl: string | null;
};

export async function listFutureGuestAppointmentsByEmail(input: {
  organizationId: string;
  email: string;
  locale?: string | null;
}): Promise<FutureGuestAppointmentMatch[]> {
  const admin = createServiceClient();
  const key = await getOrgDataKey(input.organizationId);
  const { hashEmailLookup } = await import("@/lib/security/email-lookup");
  const { data, error } = await admin
    .from("booking_appointments")
    .select(
      "id, starts_at, guest_name, guest_email, service_id, host_user_id, meet_join_url, status",
    )
    .eq("organization_id", input.organizationId)
    .eq(
      "email_lookup_hash",
      hashEmailLookup(input.organizationId, input.email, key),
    )
    .in("status", ["confirmed", "pending_payment"])
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);
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
    admin.from("booking_services").select("id, title, translations").in("id", serviceIds),
    admin.from("profiles").select("id, full_name, email").in("id", hostIds),
  ]);
  const serviceTitleById = new Map(
    (services ?? []).map((row) => [
      row.id as string,
      serviceTitle(row, input.locale),
    ]),
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
    serviceTitle: serviceTitleById.get(row.serviceId) ?? "Service",
    hostName: hostName.get(row.hostUserId) ?? row.hostUserId,
    hostUserId: row.hostUserId,
    meetJoinUrl: row.meetJoinUrl,
  }));
}

export const PROJECT_CALL_DURATION_MINUTES = 30;
export const PROJECT_CALL_INVITE_TTL_DAYS = 14;

export type ProjectCallInviteContext = {
  inviteId: string;
  organizationId: string;
  organizationName: string;
  projectId: string;
  projectTitle: string;
  personId: string;
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestPreferredLocale: string;
  host: PublicHostCalendar;
  service: BookingServiceRow;
  settings: BookingSettingsRow;
  status: "open" | "used" | "expired" | "revoked";
  appointmentStartsAt: string | null;
};

export type ProjectMeetingHistoryItem = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingAppointmentRow["status"];
  hostName: string;
  serviceTitle: string;
  meetJoinUrl: string | null;
  guestName: string;
};

export type ProjectInviteHistoryItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  appointmentId: string | null;
  emailedTo: string | null;
  hostName: string;
  status: "open" | "used" | "expired" | "revoked";
};

/** Ensure the firm has an active 30-minute call service for project invites. */
export async function ensureProjectCallService(
  organizationId: string,
): Promise<BookingServiceRow | null> {
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("booking_services")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("duration_minutes", PROJECT_CALL_DURATION_MINUTES)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as BookingServiceRow;

  const { data: created, error } = await admin
    .from("booking_services")
    .insert({
      organization_id: organizationId,
      title: "Consultation call",
      description: "30-minute call",
      translations: {
        en: { title: "Consultation call", description: "30-minute call" },
        fr: { title: "Appel de consultation", description: "Appel de 30 minutes" },
        es: { title: "Llamada de consulta", description: "Llamada de 30 minutos" },
      },
      duration_minutes: PROJECT_CALL_DURATION_MINUTES,
      price_cents: 0,
      currency: "CAD",
      is_active: true,
      sort_order: 0,
    })
    .select("*")
    .single();

  if (error || !created) {
    console.error("ensureProjectCallService:", error?.message);
    return null;
  }
  return created as BookingServiceRow;
}

export async function loadProjectCallInviteContext(
  token: string,
): Promise<ProjectCallInviteContext | null> {
  const admin = createServiceClient();
  const hash = hashBookingToken(token);
  const { data: invite, error } = await admin
    .from("project_booking_invites")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !invite) {
    if (error) console.error("loadProjectCallInviteContext:", error.message);
    return null;
  }

  const [
    { data: org },
    { data: project },
    { data: person },
    { data: settings },
    { data: service },
    { data: appointment },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name")
      .eq("id", invite.organization_id)
      .maybeSingle(),
    admin
      .from("immigration_projects")
      .select("id, title")
      .eq("id", invite.project_id)
      .maybeSingle(),
    admin
      .from("people")
      .select("*")
      .eq("id", invite.person_id)
      .maybeSingle(),
    admin
      .from("booking_settings")
      .select("*")
      .eq("organization_id", invite.organization_id)
      .eq("user_id", invite.host_user_id)
      .maybeSingle(),
    admin
      .from("booking_services")
      .select("*")
      .eq("id", invite.service_id)
      .maybeSingle(),
    invite.appointment_id
      ? admin
          .from("booking_appointments")
          .select("starts_at")
          .eq("id", invite.appointment_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!org || !project || !person || !settings || !service) return null;

  const dek = await getOrgDataKey(invite.organization_id as string);
  const decrypted = decryptPersonRow(person as PersonRow, dek);
  const projectDecrypted = decryptProjectRow(
    project as { id: string; title: string },
    dek,
  );
  const hosts = await loadHostCalendars({
    organizationId: invite.organization_id as string,
    bookingWindowDays: (settings as BookingSettingsRow).booking_window_days,
    hostUserId: invite.host_user_id as string,
  });
  const host =
    hosts.find((row) => row.userId === invite.host_user_id) ?? null;

  let status: ProjectCallInviteContext["status"] = "open";
  if (invite.revoked_at) status = "revoked";
  else if (invite.appointment_id) status = "used";
  else if (Date.parse(invite.expires_at as string) <= Date.now()) {
    status = "expired";
  }

  return {
    inviteId: invite.id as string,
    organizationId: org.id as string,
    organizationName: org.name as string,
    projectId: projectDecrypted.id,
    projectTitle: projectDecrypted.title,
    personId: decrypted.id,
    guestFirstName: decrypted.first_name,
    guestLastName: decrypted.last_name,
    guestEmail: decrypted.email ?? "",
    guestPhone: decrypted.phone,
    guestPreferredLocale: decrypted.preferred_locale || "en",
    host: host ?? {
      userId: invite.host_user_id as string,
      name: "Consultant",
      rules: [],
      blocked: [],
      busy: [],
    },
    service: service as BookingServiceRow,
    settings: settings as BookingSettingsRow,
    status,
    appointmentStartsAt: (appointment?.starts_at as string | null) ?? null,
  };
}

export async function listProjectMeetingHistory(
  projectId: string,
  locale?: string | null,
): Promise<ProjectMeetingHistoryItem[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking_appointments")
    .select(
      "id, starts_at, ends_at, status, host_user_id, service_id, meet_join_url, guest_name, guest_email, guest_phone, guest_address, form_answers",
    )
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("starts_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("listProjectMeetingHistory:", error.message);
    return [];
  }

  const rows = (data ?? []) as BookingAppointmentRow[];
  if (rows.length === 0) return [];

  const key = await getOrgDataKey(orgId);
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const serviceIds = [...new Set(rows.map((row) => row.service_id))];
  const [{ data: profiles }, { data: services }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").in("id", hostIds),
    supabase.from("booking_services").select("id, title, translations").in("id", serviceIds),
  ]);
  const hostName = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        row.id,
    ]),
  );
  const serviceTitleById = new Map(
    (services ?? []).map((row) => [
      row.id as string,
      serviceTitle(row, locale),
    ]),
  );

  return rows.map((row) => {
    const guest = decryptBookingGuestRow(row, key);
    return {
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      hostName: hostName.get(row.host_user_id) ?? row.host_user_id,
      serviceTitle: serviceTitleById.get(row.service_id) ?? "Call",
      meetJoinUrl: row.meet_join_url,
      guestName: guest.guest_name,
    };
  });
}

export async function listProjectCallInvites(
  projectId: string,
): Promise<ProjectInviteHistoryItem[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_booking_invites")
    .select(
      "id, created_at, expires_at, revoked_at, appointment_id, emailed_to, host_user_id",
    )
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("listProjectCallInvites:", error.message);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const hostIds = [
    ...new Set(rows.map((row) => row.host_user_id as string)),
  ];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", hostIds);
  const hostName = new Map(
    (profiles ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null)?.trim() ||
        (row.email as string | null) ||
        row.id,
    ]),
  );

  const now = Date.now();
  return rows.map((row) => {
    let status: ProjectInviteHistoryItem["status"] = "open";
    if (row.revoked_at) status = "revoked";
    else if (row.appointment_id) status = "used";
    else if (Date.parse(row.expires_at as string) <= now) status = "expired";
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      revokedAt: (row.revoked_at as string | null) ?? null,
      appointmentId: (row.appointment_id as string | null) ?? null,
      emailedTo: (row.emailed_to as string | null) ?? null,
      hostName: hostName.get(row.host_user_id as string) ?? "Consultant",
      status,
    };
  });
}

