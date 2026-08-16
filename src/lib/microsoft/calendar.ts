import { randomBytes } from "node:crypto";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  microsoftCalendarClientConfig,
  refreshMicrosoftAccessToken,
  MICROSOFT_CALENDAR_AAD,
} from "@/lib/microsoft/oauth";
import {
  getMicrosoftCalendarSecrets,
  updateMicrosoftCalendarSecrets,
} from "@/lib/microsoft/secrets";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SUBSCRIPTION_MINUTES = 4000;
const GRAPH_PREFER = 'IdType="ImmutableId", outlook.timezone="UTC"';

export type MicrosoftCalendarConnectionRow = {
  id: string;
  organization_id: string;
  user_id: string;
  microsoft_email: string | null;
  calendar_id: string;
  channel_id: string | null;
  channel_expiration: string | null;
  last_synced_at: string | null;
  is_enabled: boolean;
};

type GraphDateTime = {
  dateTime?: string;
  timeZone?: string;
};

type GraphEvent = {
  id?: string;
  subject?: string;
  isCancelled?: boolean;
  showAs?: string;
  isAllDay?: boolean;
  onlineMeetingUrl?: string | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
  start?: GraphDateTime;
  end?: GraphDateTime;
  "@removed"?: { reason?: string };
};

export type CreatedCalendarEvent = {
  eventId: string;
  meetJoinUrl: string | null;
};

function admin() {
  return createServiceClient();
}

function loadSecrets(connectionId: string) {
  return getMicrosoftCalendarSecrets(connectionId);
}

async function microsoftOrgDek(connectionId: string, organizationId?: string) {
  if (organizationId) return getOrgDataKey(organizationId);
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data?.organization_id) {
    throw new Error("microsoft_not_connected");
  }
  return getOrgDataKey(data.organization_id as string);
}

export async function getValidAccessToken(connectionId: string) {
  const secrets = await loadSecrets(connectionId);
  if (!secrets) throw new Error("microsoft_not_connected");
  const dek = await microsoftOrgDek(connectionId);
  const refreshToken = decryptField(
    secrets.refresh_token_encrypted,
    MICROSOFT_CALENDAR_AAD.refreshToken,
    dek,
  );
  const expiresAt = secrets.access_token_expires_at
    ? new Date(secrets.access_token_expires_at).getTime()
    : 0;
  if (secrets.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return decryptField(
      secrets.access_token_encrypted,
      MICROSOFT_CALENDAR_AAD.accessToken,
      dek,
    );
  }
  const refreshed = await refreshMicrosoftAccessToken(refreshToken);
  const nextRefresh = refreshed.refresh_token
    ? encryptField(
        refreshed.refresh_token,
        MICROSOFT_CALENDAR_AAD.refreshToken,
        dek,
      )
    : null;
  if (nextRefresh) {
    await admin().rpc("upsert_microsoft_calendar_secrets", {
      p_connection_id: connectionId,
      p_refresh_token_encrypted: nextRefresh,
      p_access_token_encrypted: encryptField(
        refreshed.access_token,
        MICROSOFT_CALENDAR_AAD.accessToken,
        dek,
      ),
      p_access_token_expires_at: new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString(),
      p_sync_token: secrets.sync_token,
    });
  } else {
    await updateMicrosoftCalendarSecrets(connectionId, {
      accessTokenEncrypted: encryptField(
        refreshed.access_token,
        MICROSOFT_CALENDAR_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    });
  }
  return refreshed.access_token;
}

async function graphFetch(accessToken: string, path: string, init?: RequestInit) {
  const url = path.startsWith("https://") ? path : `${GRAPH}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: GRAPH_PREFER,
      ...(init?.headers ?? {}),
    },
  });
}

function toGraphDateTime(iso: string): GraphDateTime {
  const dateTime = new Date(iso).toISOString().replace(/\.\d{3}Z$/, "");
  return { dateTime, timeZone: "UTC" };
}

function fromGraphDateTime(value?: GraphDateTime | null) {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/(\.\d{3})\d+/, "$1");
  const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(cleaned);
  const parsed = new Date(hasZone ? cleaned : `${cleaned}Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function eventSummary(event: GraphEvent) {
  const value = event.subject?.trim();
  if (!value) return null;
  return value.slice(0, 200);
}

function teamsJoinUrlFromEvent(event: GraphEvent) {
  const join =
    event.onlineMeeting?.joinUrl?.trim() || event.onlineMeetingUrl?.trim();
  if (join?.startsWith("https://")) return join;
  return null;
}

function eventBounds(event: GraphEvent) {
  const start = fromGraphDateTime(event.start);
  const end = fromGraphDateTime(event.end);
  if (!start || !end) return null;
  return { starts_at: start, ends_at: end };
}

function isBusyShowAs(showAs: string | undefined) {
  if (!showAs) return true;
  return showAs !== "free";
}

const EVENT_SELECT =
  "id,subject,isCancelled,showAs,isAllDay,start,end,onlineMeeting,onlineMeetingUrl";

export async function createBookingCalendarEvent(input: {
  connectionId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  withTeams?: boolean;
}): Promise<CreatedCalendarEvent | null> {
  if (!microsoftCalendarClientConfig()) return null;
  const accessToken = await getValidAccessToken(input.connectionId);
  const baseBody = {
    subject: input.title,
    body: {
      contentType: "Text",
      content: input.description,
    },
    location: input.location
      ? { displayName: input.location }
      : undefined,
    start: toGraphDateTime(input.startsAt),
    end: toGraphDateTime(input.endsAt),
    isReminderOn: true,
  };
  const withTeams = {
    ...baseBody,
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };

  let response = await graphFetch(
    accessToken,
    `/me/events?$select=${EVENT_SELECT}`,
    {
      method: "POST",
      body: JSON.stringify(input.withTeams ? withTeams : baseBody),
    },
  );
  if (!response.ok && input.withTeams) {
    const text = await response.text();
    console.error(
      "microsoft event create with teams failed:",
      response.status,
      text.slice(0, 240),
    );
    response = await graphFetch(accessToken, `/me/events?$select=${EVENT_SELECT}`, {
      method: "POST",
      body: JSON.stringify(baseBody),
    });
  }
  if (!response.ok) {
    const retryText = await response.text();
    throw new Error(
      `microsoft_event_create:${response.status}:${retryText.slice(0, 240)}`,
    );
  }
  const event = (await response.json()) as GraphEvent;
  if (!event.id) return null;
  return {
    eventId: event.id,
    meetJoinUrl: teamsJoinUrlFromEvent(event),
  };
}

export async function updateBookingCalendarEvent(input: {
  connectionId: string;
  microsoftEventId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  withTeams?: boolean;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const eventPath = `/me/events/${encodeURIComponent(input.microsoftEventId)}?$select=${EVENT_SELECT}`;
  const baseBody = {
    subject: input.title,
    body: {
      contentType: "Text",
      content: input.description,
    },
    location: input.location
      ? { displayName: input.location }
      : undefined,
    start: toGraphDateTime(input.startsAt),
    end: toGraphDateTime(input.endsAt),
  };

  async function patchEvent(body: object) {
    const response = await graphFetch(accessToken, eventPath, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `microsoft_event_update:${response.status}:${text.slice(0, 240)}`,
      );
    }
    return (await response.json()) as GraphEvent;
  }

  let event = await patchEvent(baseBody);
  if (!event) return null;
  if (input.withTeams && !teamsJoinUrlFromEvent(event)) {
    try {
      const withTeams = await patchEvent({
        ...baseBody,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      });
      if (withTeams) event = withTeams;
    } catch (error) {
      console.error("microsoft teams update create:", error);
    }
  }
  return {
    eventId: input.microsoftEventId,
    meetJoinUrl: teamsJoinUrlFromEvent(event),
  };
}

export async function deleteBookingCalendarEvent(input: {
  connectionId: string;
  microsoftEventId: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await graphFetch(
    accessToken,
    `/me/events/${encodeURIComponent(input.microsoftEventId)}`,
    { method: "DELETE" },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `microsoft_event_delete:${response.status}:${text.slice(0, 240)}`,
    );
  }
}

export async function queryMicrosoftFreeBusy(input: {
  connectionId: string;
  email: string | null;
  timeMin: string;
  timeMax: string;
}): Promise<{ starts_at: string; ends_at: string }[]> {
  if (!input.email) return [];
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await graphFetch(accessToken, "/me/calendar/getSchedule", {
    method: "POST",
    body: JSON.stringify({
      schedules: [input.email],
      startTime: toGraphDateTime(input.timeMin),
      endTime: toGraphDateTime(input.timeMax),
      availabilityViewInterval: 30,
    }),
  });
  if (!response.ok) {
    console.error("microsoft getSchedule:", response.status);
    return [];
  }
  const data = (await response.json()) as {
    value?: {
      scheduleItems?: {
        status?: string;
        start?: GraphDateTime;
        end?: GraphDateTime;
      }[];
    }[];
  };
  const items = data.value?.[0]?.scheduleItems ?? [];
  const busy: { starts_at: string; ends_at: string }[] = [];
  for (const item of items) {
    if (item.status === "free") continue;
    const start = fromGraphDateTime(item.start);
    const end = fromGraphDateTime(item.end);
    if (!start || !end) continue;
    busy.push({ starts_at: start, ends_at: end });
  }
  return busy;
}

export async function syncMicrosoftBusy(
  connection: MicrosoftCalendarConnectionRow,
) {
  const accessToken = await getValidAccessToken(connection.id);
  const secrets = await loadSecrets(connection.id);
  if (!secrets) return;

  const ourEventIds = new Set<string>();
  const { data: ours } = await admin()
    .from("booking_appointments")
    .select("microsoft_event_id")
    .eq("organization_id", connection.organization_id)
    .not("microsoft_event_id", "is", null);
  for (const row of ours ?? []) {
    if (row.microsoft_event_id) {
      ourEventIds.add(row.microsoft_event_id as string);
    }
  }

  const collected: GraphEvent[] = [];
  let nextDeltaLink: string | null = null;
  let usedDelta = Boolean(secrets.sync_token);
  let url =
    secrets.sync_token ??
    `/me/calendarView/delta?startDateTime=${encodeURIComponent(
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
    )}&endDateTime=${encodeURIComponent(
      new Date(Date.now() + 120 * 86_400_000).toISOString(),
    )}`;

  for (let i = 0; i < 20; i += 1) {
    const response = await graphFetch(accessToken, url);
    if (response.status === 410) {
      usedDelta = false;
      collected.length = 0;
      url = `/me/calendarView/delta?startDateTime=${encodeURIComponent(
        new Date(Date.now() - 7 * 86_400_000).toISOString(),
      )}&endDateTime=${encodeURIComponent(
        new Date(Date.now() + 120 * 86_400_000).toISOString(),
      )}`;
      continue;
    }
    if (!response.ok) {
      console.error(
        "microsoft calendarView.delta:",
        response.status,
        await response.text(),
      );
      break;
    }
    const payload = (await response.json()) as {
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };
    collected.push(...(payload.value ?? []));
    nextDeltaLink = payload["@odata.deltaLink"] ?? nextDeltaLink;
    const next = payload["@odata.nextLink"];
    if (!next) break;
    url = next;
  }

  if (!usedDelta) {
    await admin()
      .from("booking_microsoft_busy")
      .delete()
      .eq("connection_id", connection.id);
  }

  for (const event of collected) {
    const eventId = event.id;
    if (!eventId) continue;
    const removed = Boolean(event["@removed"]) || event.isCancelled;
    if (removed || ourEventIds.has(eventId) || !isBusyShowAs(event.showAs)) {
      await admin()
        .from("booking_microsoft_busy")
        .delete()
        .eq("connection_id", connection.id)
        .eq("microsoft_event_id", eventId);
      continue;
    }
    const bounds = eventBounds(event);
    if (!bounds) continue;
    await admin().from("booking_microsoft_busy").upsert(
      {
        organization_id: connection.organization_id,
        connection_id: connection.id,
        microsoft_event_id: eventId,
        summary: eventSummary(event),
        starts_at: bounds.starts_at,
        ends_at: bounds.ends_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,microsoft_event_id" },
    );
  }

  if (nextDeltaLink) {
    await updateMicrosoftCalendarSecrets(connection.id, {
      syncToken: nextDeltaLink,
    });
  }

  await admin()
    .from("microsoft_calendar_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
}

export async function stopMicrosoftWatch(
  connection: MicrosoftCalendarConnectionRow,
) {
  if (!connection.channel_id) return;
  try {
    const accessToken = await getValidAccessToken(connection.id);
    await graphFetch(
      accessToken,
      `/subscriptions/${encodeURIComponent(connection.channel_id)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    console.error("microsoft watch stop:", error);
  }
}

export async function startMicrosoftWatch(
  connection: MicrosoftCalendarConnectionRow,
  webhookUrl: string,
) {
  await stopMicrosoftWatch(connection);
  const accessToken = await getValidAccessToken(connection.id);
  const clientState = randomBytes(24).toString("base64url");
  const expiration = new Date(
    Date.now() + SUBSCRIPTION_MINUTES * 60_000,
  ).toISOString();
  const response = await graphFetch(accessToken, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created,updated,deleted",
      notificationUrl: webhookUrl,
      resource: "/me/events",
      expirationDateTime: expiration,
      clientState,
    }),
  });
  if (!response.ok) {
    console.error("microsoft watch:", response.status, await response.text());
    return;
  }
  const subscription = (await response.json()) as {
    id?: string;
    expirationDateTime?: string;
  };
  if (!subscription.id) return;
  await admin()
    .from("microsoft_calendar_connections")
    .update({
      channel_id: subscription.id,
      channel_expiration: subscription.expirationDateTime ?? expiration,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
  await updateMicrosoftCalendarSecrets(connection.id, {
    channelTokenEncrypted: encryptField(
      clientState,
      MICROSOFT_CALENDAR_AAD.channelToken,
      await getOrgDataKey(connection.organization_id),
    ),
  });
}

export async function verifyMicrosoftChannelToken(
  connectionId: string,
  incomingToken: string | null,
) {
  if (!incomingToken) return false;
  const secrets = await loadSecrets(connectionId);
  if (!secrets?.channel_token_encrypted) return false;
  try {
    const expected = decryptField(
      secrets.channel_token_encrypted,
      MICROSOFT_CALENDAR_AAD.channelToken,
      await microsoftOrgDek(connectionId),
    );
    return expected === incomingToken;
  } catch {
    return false;
  }
}

export async function getUserMicrosoftConnection(
  organizationId: string,
  userId: string,
) {
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getUserMicrosoftConnection:", error.message);
    return null;
  }
  return (data as MicrosoftCalendarConnectionRow | null) ?? null;
}

export async function getMicrosoftConnectionById(connectionId: string) {
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) {
    console.error("getMicrosoftConnectionById:", error.message);
    return null;
  }
  return (data as MicrosoftCalendarConnectionRow | null) ?? null;
}

export async function getMicrosoftConnectionByChannelId(channelId: string) {
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) {
    console.error("getMicrosoftConnectionByChannelId:", error.message);
    return null;
  }
  return (data as MicrosoftCalendarConnectionRow | null) ?? null;
}

export async function listEnabledMicrosoftConnections(organizationId: string) {
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  if (error) {
    console.error("listEnabledMicrosoftConnections:", error.message);
    return [];
  }
  const { isActiveCalendarVendor, mapOrgCalendarProviders } = await import(
    "@/lib/booking/integrations"
  );
  const providers = await mapOrgCalendarProviders(organizationId);
  return ((data ?? []) as MicrosoftCalendarConnectionRow[]).filter((row) =>
    isActiveCalendarVendor(row.user_id, "microsoft", providers),
  );
}

export async function listAllEnabledMicrosoftConnections() {
  const { data, error } = await admin()
    .from("microsoft_calendar_connections")
    .select("*")
    .eq("is_enabled", true);
  if (error) {
    console.error("listAllEnabledMicrosoftConnections:", error.message);
    return [];
  }
  const { isActiveCalendarVendor, mapAllCalendarProviders } = await import(
    "@/lib/booking/integrations"
  );
  const providers = await mapAllCalendarProviders();
  return ((data ?? []) as MicrosoftCalendarConnectionRow[]).filter((row) =>
    isActiveCalendarVendor(
      `${row.organization_id}:${row.user_id}`,
      "microsoft",
      providers,
    ),
  );
}

async function maybeRenewWatch(connection: MicrosoftCalendarConnectionRow) {
  const expires = connection.channel_expiration
    ? new Date(connection.channel_expiration).getTime()
    : 0;
  if (expires > Date.now() + 20 * 60 * 60 * 1000) return;
  const webhookBase = await getAppBaseUrl();
  if (!webhookBase.startsWith("https://")) return;
  await startMicrosoftWatch(
    connection,
    `${webhookBase.replace(/\/$/, "")}/api/calendar/microsoft/webhook`,
  );
}

export async function refreshMicrosoftBusyIfStale(organizationId: string) {
  const connections = await listEnabledMicrosoftConnections(organizationId);
  for (const connection of connections) {
    const last = connection.last_synced_at
      ? new Date(connection.last_synced_at).getTime()
      : 0;
    if (last < Date.now() - 15 * 60_000) {
      try {
        await syncMicrosoftBusy(connection);
      } catch (error) {
        console.error("stale microsoft sync:", error);
      }
    }
    try {
      await maybeRenewWatch(connection);
    } catch (error) {
      console.error("renew microsoft watch:", error);
    }
  }
}

export async function refreshAllMicrosoftCalendars() {
  const connections = await listAllEnabledMicrosoftConnections();
  const { mapLimit } = await import("@/lib/async/map-limit");
  const results = await mapLimit(connections, 3, async (connection) => {
    let synced = false;
    try {
      await syncMicrosoftBusy(connection);
      synced = true;
    } catch (error) {
      console.error("cron microsoft sync:", connection.id, error);
    }
    try {
      await maybeRenewWatch(connection);
    } catch (error) {
      console.error("cron microsoft watch:", connection.id, error);
    }
    return synced;
  });
  const synced = results.filter(Boolean).length;
  return {
    connections: connections.length,
    synced,
    failed: connections.length - synced,
  };
}

export async function pushAppointmentToMicrosoftCalendar(input: {
  organizationId: string;
  hostUserId: string | null;
  appointmentId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  withTeams?: boolean;
}): Promise<CreatedCalendarEvent | null> {
  if (!microsoftCalendarClientConfig() || !input.hostUserId) return null;
  const connection = await getUserMicrosoftConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return null;
  try {
    const created = await createBookingCalendarEvent({
      connectionId: connection.id,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withTeams: input.withTeams === true,
    });
    if (!created) return null;
    await admin()
      .from("booking_appointments")
      .update({
        microsoft_event_id: created.eventId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.appointmentId)
      .eq("organization_id", input.organizationId);
    return created;
  } catch (error) {
    console.error("push appointment to microsoft:", error);
    return null;
  }
}

export async function updateAppointmentMicrosoftEvent(input: {
  organizationId: string;
  hostUserId: string | null;
  appointmentId: string;
  microsoftEventId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  withTeams?: boolean;
}): Promise<CreatedCalendarEvent | null> {
  if (!microsoftCalendarClientConfig() || !input.hostUserId) return null;
  const connection = await getUserMicrosoftConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return null;
  try {
    if (input.microsoftEventId) {
      const updated = await updateBookingCalendarEvent({
        connectionId: connection.id,
        microsoftEventId: input.microsoftEventId,
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location,
        withTeams: input.withTeams === true,
      });
      if (updated) return updated;
    }
    return await pushAppointmentToMicrosoftCalendar({
      organizationId: input.organizationId,
      hostUserId: input.hostUserId,
      appointmentId: input.appointmentId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withTeams: input.withTeams,
    });
  } catch (error) {
    console.error("update appointment microsoft event:", error);
    return null;
  }
}

export async function deleteAppointmentMicrosoftEvent(input: {
  organizationId: string;
  hostUserId: string | null;
  microsoftEventId: string;
}) {
  if (!input.hostUserId) return;
  const connection = await getUserMicrosoftConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return;
  try {
    await deleteBookingCalendarEvent({
      connectionId: connection.id,
      microsoftEventId: input.microsoftEventId,
    });
  } catch (error) {
    console.error("delete appointment microsoft event:", error);
  }
}
