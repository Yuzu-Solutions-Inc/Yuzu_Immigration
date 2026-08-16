import { randomBytes } from "node:crypto";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  googleCalendarClientConfig,
  refreshGoogleAccessToken,
} from "@/lib/google/oauth";
import { GOOGLE_CALENDAR_AAD } from "@/lib/google/oauth";
import {
  getGoogleCalendarSecrets,
  updateGoogleCalendarSecrets,
} from "@/lib/google/secrets";
import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

const APPOINTMENT_PROP = "myconsultantAppointmentId";

export type GoogleCalendarConnectionRow = {
  id: string;
  organization_id: string;
  user_id: string;
  google_email: string | null;
  calendar_id: string;
  channel_id: string | null;
  channel_resource_id: string | null;
  channel_expiration: string | null;
  last_synced_at: string | null;
  is_enabled: boolean;
};

export type GoogleBusyRow = {
  id: string;
  organization_id: string;
  connection_id: string;
  google_event_id: string;
  starts_at: string;
  ends_at: string;
};

type CalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

function eventSummary(event: CalendarEvent) {
  const value = event.summary?.trim();
  if (!value) return null;
  return value.slice(0, 200);
}

function meetJoinUrlFromEvent(event: CalendarEvent) {
  const hangout = event.hangoutLink?.trim();
  if (hangout?.startsWith("https://")) return hangout;
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video",
  )?.uri?.trim();
  if (video?.startsWith("https://")) return video;
  return null;
}

export type CreatedCalendarEvent = {
  eventId: string;
  meetJoinUrl: string | null;
};

function admin() {
  return createServiceClient();
}

async function loadSecrets(connectionId: string) {
  return getGoogleCalendarSecrets(connectionId);
}

async function googleOrgDek(connectionId: string, organizationId?: string) {
  if (organizationId) return getOrgDataKey(organizationId);
  const { data, error } = await admin()
    .from("google_calendar_connections")
    .select("organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data?.organization_id) {
    throw new Error("google_not_connected");
  }
  return getOrgDataKey(data.organization_id as string);
}

export async function getValidAccessToken(connectionId: string) {
  const secrets = await loadSecrets(connectionId);
  if (!secrets) throw new Error("google_not_connected");
  const dek = await googleOrgDek(connectionId);
  const refreshToken = decryptField(
    secrets.refresh_token_encrypted,
    GOOGLE_CALENDAR_AAD.refreshToken,
    dek,
  );
  const expiresAt = secrets.access_token_expires_at
    ? new Date(secrets.access_token_expires_at).getTime()
    : 0;
  if (
    secrets.access_token_encrypted &&
    expiresAt > Date.now() + 60_000
  ) {
    return decryptField(
      secrets.access_token_encrypted,
      GOOGLE_CALENDAR_AAD.accessToken,
      dek,
    );
  }
  const refreshed = await refreshGoogleAccessToken(refreshToken);
  await updateGoogleCalendarSecrets(connectionId, {
    accessTokenEncrypted: encryptField(
      refreshed.access_token,
      GOOGLE_CALENDAR_AAD.accessToken,
      dek,
    ),
    accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

async function calendarFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

export async function createBookingCalendarEvent(input: {
  connectionId: string;
  calendarId: string;
  appointmentId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  attendeeEmail?: string;
}): Promise<CreatedCalendarEvent | null> {
  if (!googleCalendarClientConfig()) return null;
  const accessToken = await getValidAccessToken(input.connectionId);
  const body = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
    extendedProperties: {
      private: { [APPOINTMENT_PROP]: input.appointmentId },
    },
    attendees: input.attendeeEmail
      ? [{ email: input.attendeeEmail }]
      : undefined,
    conferenceData: {
      createRequest: {
        requestId: randomBytes(16).toString("hex"),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  let response = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    console.error(
      "google event create with meet failed:",
      response.status,
      text.slice(0, 240),
    );
    response = await calendarFetch(
      accessToken,
      `/calendars/${encodeURIComponent(input.calendarId)}/events?sendUpdates=none`,
      {
        method: "POST",
        body: JSON.stringify({ ...body, conferenceData: undefined }),
      },
    );
    if (!response.ok) {
      const retryText = await response.text();
      throw new Error(
        `google_event_create:${response.status}:${retryText.slice(0, 240)}`,
      );
    }
  }
  const event = (await response.json()) as CalendarEvent;
  if (!event.id) return null;
  return {
    eventId: event.id,
    meetJoinUrl: meetJoinUrlFromEvent(event),
  };
}

export async function updateBookingCalendarEvent(input: {
  connectionId: string;
  calendarId: string;
  googleEventId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const eventPath = `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.googleEventId)}?conferenceDataVersion=1&sendUpdates=none`;
  const baseBody = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
  };

  async function patchEvent(body: object) {
    const response = await calendarFetch(accessToken, eventPath, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (response.status === 404 || response.status === 410) return null;
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `google_event_update:${response.status}:${text.slice(0, 240)}`,
      );
    }
    return (await response.json()) as CalendarEvent;
  }

  let event = await patchEvent(baseBody);
  if (!event) return null;
  if (!meetJoinUrlFromEvent(event)) {
    try {
      const withMeet = await patchEvent({
        ...baseBody,
        conferenceData: {
          createRequest: {
            requestId: randomBytes(16).toString("hex"),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      });
      if (withMeet) event = withMeet;
    } catch (error) {
      console.error("google meet update create:", error);
    }
  }
  return {
    eventId: input.googleEventId,
    meetJoinUrl: meetJoinUrlFromEvent(event),
  };
}

export async function deleteBookingCalendarEvent(input: {
  connectionId: string;
  calendarId: string;
  googleEventId: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.googleEventId)}`,
    { method: "DELETE" },
  );
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_event_delete:${response.status}:${text.slice(0, 240)}`);
  }
}

export async function queryGoogleFreeBusy(input: {
  connectionId: string;
  calendarId: string;
  timeMin: string;
  timeMax: string;
}): Promise<{ starts_at: string; ends_at: string }[]> {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await calendarFetch(accessToken, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      items: [{ id: input.calendarId }],
    }),
  });
  if (!response.ok) {
    console.error("google freeBusy:", response.status);
    return [];
  }
  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };
  const busy = data.calendars?.[input.calendarId]?.busy ?? [];
  return busy.map((slot) => ({ starts_at: slot.start, ends_at: slot.end }));
}

function eventBounds(event: CalendarEvent) {
  const start = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00.000Z` : null);
  const end = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00.000Z` : null);
  if (!start || !end) return null;
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
}

export async function syncGoogleBusy(connection: GoogleCalendarConnectionRow) {
  const accessToken = await getValidAccessToken(connection.id);
  const secrets = await loadSecrets(connection.id);
  if (!secrets) return;

  const ourEventIds = new Set<string>();
  const { data: ours } = await admin()
    .from("booking_appointments")
    .select("google_event_id")
    .eq("organization_id", connection.organization_id)
    .not("google_event_id", "is", null);
  for (const row of ours ?? []) {
    if (row.google_event_id) ourEventIds.add(row.google_event_id as string);
  }

  let syncToken = secrets.sync_token;
  const collected: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  const runList = async (params: URLSearchParams) => {
    const response = await calendarFetch(
      accessToken,
      `/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params.toString()}`,
    );
    return response;
  };

  const firstParams = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
  });
  if (syncToken) {
    firstParams.set("syncToken", syncToken);
  } else {
    firstParams.set("timeMin", new Date(Date.now() - 7 * 86_400_000).toISOString());
    firstParams.set(
      "timeMax",
      new Date(Date.now() + 120 * 86_400_000).toISOString(),
    );
  }

  let params = firstParams;
  for (let i = 0; i < 20; i += 1) {
    if (pageToken) params.set("pageToken", pageToken);
    const response = await runList(params);
    if (response.status === 410) {
      syncToken = null;
      params = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "250",
        timeMin: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        timeMax: new Date(Date.now() + 120 * 86_400_000).toISOString(),
      });
      pageToken = undefined;
      continue;
    }
    if (!response.ok) {
      console.error("google events.list:", response.status, await response.text());
      break;
    }
    const payload = (await response.json()) as {
      items?: CalendarEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    collected.push(...(payload.items ?? []));
    nextSyncToken = payload.nextSyncToken ?? nextSyncToken;
    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  if (!syncToken) {
    await admin()
      .from("booking_google_busy")
      .delete()
      .eq("connection_id", connection.id);
  }

  for (const event of collected) {
    const eventId = event.id;
    if (!eventId) continue;
    if (event.status === "cancelled" || ourEventIds.has(eventId)) {
      await admin()
        .from("booking_google_busy")
        .delete()
        .eq("connection_id", connection.id)
        .eq("google_event_id", eventId);
      continue;
    }
    if (event.extendedProperties?.private?.[APPOINTMENT_PROP]) {
      continue;
    }
    if (event.transparency === "transparent") {
      await admin()
        .from("booking_google_busy")
        .delete()
        .eq("connection_id", connection.id)
        .eq("google_event_id", eventId);
      continue;
    }
    const bounds = eventBounds(event);
    if (!bounds) continue;
    await admin().from("booking_google_busy").upsert(
      {
        organization_id: connection.organization_id,
        connection_id: connection.id,
        google_event_id: eventId,
        summary: eventSummary(event),
        starts_at: bounds.starts_at,
        ends_at: bounds.ends_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id,google_event_id" },
    );
  }

  await updateGoogleCalendarSecrets(connection.id, {
    syncToken: nextSyncToken,
  });

  await admin()
    .from("google_calendar_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
}

export async function stopGoogleWatch(connection: GoogleCalendarConnectionRow) {
  if (!connection.channel_id || !connection.channel_resource_id) return;
  try {
    const accessToken = await getValidAccessToken(connection.id);
    await calendarFetch(accessToken, "/channels/stop", {
      method: "POST",
      body: JSON.stringify({
        id: connection.channel_id,
        resourceId: connection.channel_resource_id,
      }),
    });
  } catch (error) {
    console.error("google watch stop:", error);
  }
}

export async function startGoogleWatch(
  connection: GoogleCalendarConnectionRow,
  webhookUrl: string,
) {
  await stopGoogleWatch(connection);
  const accessToken = await getValidAccessToken(connection.id);
  const channelId = randomBytes(16).toString("hex");
  const channelToken = randomBytes(24).toString("base64url");
  const response = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(connection.calendar_id)}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken,
        params: { ttl: "604800" },
      }),
    },
  );
  if (!response.ok) {
    console.error("google watch:", response.status, await response.text());
    return;
  }
  const channel = (await response.json()) as {
    resourceId?: string;
    expiration?: string;
  };
  await admin()
    .from("google_calendar_connections")
    .update({
      channel_id: channelId,
      channel_resource_id: channel.resourceId ?? null,
      channel_expiration: channel.expiration
        ? new Date(Number(channel.expiration)).toISOString()
        : new Date(Date.now() + 7 * 86_400_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);
  await updateGoogleCalendarSecrets(connection.id, {
    channelTokenEncrypted: encryptField(
      channelToken,
      GOOGLE_CALENDAR_AAD.channelToken,
      await getOrgDataKey(connection.organization_id),
    ),
  });
}

export async function verifyGoogleChannelToken(
  connectionId: string,
  incomingToken: string | null,
) {
  if (!incomingToken) return false;
  const secrets = await loadSecrets(connectionId);
  if (!secrets?.channel_token_encrypted) return false;
  try {
    const expected = decryptField(
      secrets.channel_token_encrypted,
      GOOGLE_CALENDAR_AAD.channelToken,
      await googleOrgDek(connectionId),
    );
    return expected === incomingToken;
  } catch {
    return false;
  }
}

export async function getUserGoogleConnection(
  organizationId: string,
  userId: string,
) {
  const { data, error } = await admin()
    .from("google_calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getUserGoogleConnection:", error.message);
    return null;
  }
  return (data as GoogleCalendarConnectionRow | null) ?? null;
}

export async function getGoogleConnectionById(connectionId: string) {
  const { data, error } = await admin()
    .from("google_calendar_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) {
    console.error("getGoogleConnectionById:", error.message);
    return null;
  }
  return (data as GoogleCalendarConnectionRow | null) ?? null;
}

export async function listEnabledGoogleConnections(organizationId: string) {
  const { data, error } = await admin()
    .from("google_calendar_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  if (error) {
    console.error("listEnabledGoogleConnections:", error.message);
    return [];
  }
  return (data ?? []) as GoogleCalendarConnectionRow[];
}

export async function listAllEnabledGoogleConnections() {
  const { data, error } = await admin()
    .from("google_calendar_connections")
    .select("*")
    .eq("is_enabled", true);
  if (error) {
    console.error("listAllEnabledGoogleConnections:", error.message);
    return [];
  }
  return (data ?? []) as GoogleCalendarConnectionRow[];
}

async function maybeRenewWatch(connection: GoogleCalendarConnectionRow) {
  const expires = connection.channel_expiration
    ? new Date(connection.channel_expiration).getTime()
    : 0;
  if (expires > Date.now() + 2 * 86_400_000) return;
  const webhookBase = await getAppBaseUrl();
  if (!webhookBase.startsWith("https://")) return;
  await startGoogleWatch(
    connection,
    `${webhookBase.replace(/\/$/, "")}/api/calendar/google/webhook`,
  );
}

export async function refreshGoogleBusyIfStale(organizationId: string) {
  const connections = await listEnabledGoogleConnections(organizationId);
  for (const connection of connections) {
    const last = connection.last_synced_at
      ? new Date(connection.last_synced_at).getTime()
      : 0;
    if (last < Date.now() - 15 * 60_000) {
      try {
        await syncGoogleBusy(connection);
      } catch (error) {
        console.error("stale google sync:", error);
      }
    }
    try {
      await maybeRenewWatch(connection);
    } catch (error) {
      console.error("renew google watch:", error);
    }
  }
}

export async function refreshAllGoogleCalendars() {
  const connections = await listAllEnabledGoogleConnections();
  const { mapLimit } = await import("@/lib/async/map-limit");
  const results = await mapLimit(connections, 3, async (connection) => {
    let synced = false;
    try {
      await syncGoogleBusy(connection);
      synced = true;
    } catch (error) {
      console.error("cron google sync:", connection.id, error);
    }
    try {
      await maybeRenewWatch(connection);
    } catch (error) {
      console.error("cron google watch:", connection.id, error);
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

export async function pushAppointmentToGoogleCalendar(input: {
  organizationId: string;
  hostUserId: string | null;
  appointmentId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}): Promise<CreatedCalendarEvent | null> {
  if (!googleCalendarClientConfig() || !input.hostUserId) return null;
  const connection = await getUserGoogleConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return null;
  try {
    const created = await createBookingCalendarEvent({
      connectionId: connection.id,
      calendarId: connection.calendar_id,
      appointmentId: input.appointmentId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
    });
    if (!created) return null;
    await admin()
      .from("booking_appointments")
      .update({
        google_event_id: created.eventId,
        meet_join_url: created.meetJoinUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.appointmentId)
      .eq("organization_id", input.organizationId);
    return created;
  } catch (error) {
    console.error("push appointment to google:", error);
    return null;
  }
}

export async function updateAppointmentGoogleEvent(input: {
  organizationId: string;
  hostUserId: string | null;
  appointmentId: string;
  googleEventId: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
}): Promise<CreatedCalendarEvent | null> {
  if (!googleCalendarClientConfig() || !input.hostUserId) return null;
  const connection = await getUserGoogleConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return null;
  try {
    if (input.googleEventId) {
      const updated = await updateBookingCalendarEvent({
        connectionId: connection.id,
        calendarId: connection.calendar_id,
        googleEventId: input.googleEventId,
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location,
      });
      if (updated) {
        if (updated.meetJoinUrl) {
          await admin()
            .from("booking_appointments")
            .update({
              meet_join_url: updated.meetJoinUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", input.appointmentId)
            .eq("organization_id", input.organizationId);
        }
        return updated;
      }
    }
    return await pushAppointmentToGoogleCalendar({
      organizationId: input.organizationId,
      hostUserId: input.hostUserId,
      appointmentId: input.appointmentId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
    });
  } catch (error) {
    console.error("update appointment google event:", error);
    return null;
  }
}

export async function deleteAppointmentGoogleEvent(input: {
  organizationId: string;
  hostUserId: string | null;
  googleEventId: string;
}) {
  if (!input.hostUserId) return;
  const connection = await getUserGoogleConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (!connection) return;
  try {
    await deleteBookingCalendarEvent({
      connectionId: connection.id,
      calendarId: connection.calendar_id,
      googleEventId: input.googleEventId,
    });
  } catch (error) {
    console.error("delete appointment google event:", error);
  }
}
