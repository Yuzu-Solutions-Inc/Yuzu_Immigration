import { decryptField, encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { refreshZoomAccessToken, ZOOM_AAD, zoomClientConfig } from "@/lib/zoom/oauth";
import {
  getZoomSecrets,
  updateZoomSecrets,
  upsertZoomSecrets,
} from "@/lib/zoom/secrets";

export type ZoomConnectionRow = {
  id: string;
  organization_id: string;
  user_id: string;
  zoom_email: string | null;
  zoom_user_id: string | null;
  is_enabled: boolean;
};

const ZOOM_API = "https://api.zoom.us/v2";
const CONFERENCE_PREFIX = "zoom:";

function admin() {
  return createServiceClient();
}

export function isZoomConferenceId(conferenceId: string | null | undefined) {
  if (!conferenceId) return false;
  return (
    conferenceId.startsWith(CONFERENCE_PREFIX) || /^\d{8,}$/.test(conferenceId)
  );
}

export function zoomMeetingIdFromConference(conferenceId: string) {
  return conferenceId.startsWith(CONFERENCE_PREFIX)
    ? conferenceId.slice(CONFERENCE_PREFIX.length)
    : conferenceId;
}

function toZoomConferenceId(meetingId: string | number) {
  return `${CONFERENCE_PREFIX}${meetingId}`;
}

async function zoomOrgDek(connectionId: string, organizationId?: string) {
  if (organizationId) return getOrgDataKey(organizationId);
  const { data, error } = await admin()
    .from("zoom_connections")
    .select("organization_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error || !data?.organization_id) {
    throw new Error("zoom_not_connected");
  }
  return getOrgDataKey(data.organization_id as string);
}

export async function getUserZoomConnection(
  organizationId: string,
  userId: string,
) {
  const { data, error } = await admin()
    .from("zoom_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getUserZoomConnection:", error.message);
    return null;
  }
  return (data as ZoomConnectionRow | null) ?? null;
}

export async function getValidAccessToken(connectionId: string) {
  if (!zoomClientConfig()) throw new Error("zoom_not_configured");
  const secrets = await getZoomSecrets(connectionId);
  if (!secrets) throw new Error("zoom_not_connected");
  const dek = await zoomOrgDek(connectionId);
  const refreshToken = decryptField(
    secrets.refresh_token_encrypted,
    ZOOM_AAD.refreshToken,
    dek,
  );
  const expiresAt = secrets.access_token_expires_at
    ? new Date(secrets.access_token_expires_at).getTime()
    : 0;
  if (secrets.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    return decryptField(
      secrets.access_token_encrypted,
      ZOOM_AAD.accessToken,
      dek,
    );
  }
  const refreshed = await refreshZoomAccessToken(refreshToken);
  const nextRefresh = refreshed.refresh_token
    ? encryptField(refreshed.refresh_token, ZOOM_AAD.refreshToken, dek)
    : null;
  if (nextRefresh) {
    await upsertZoomSecrets({
      connectionId,
      refreshTokenEncrypted: nextRefresh,
      accessTokenEncrypted: encryptField(
        refreshed.access_token,
        ZOOM_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    });
  } else {
    await updateZoomSecrets(connectionId, {
      accessTokenEncrypted: encryptField(
        refreshed.access_token,
        ZOOM_AAD.accessToken,
        dek,
      ),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    });
  }
  return refreshed.access_token;
}

function durationMinutes(startsAt: string, endsAt: string) {
  const minutes = Math.round(
    (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000,
  );
  return Math.max(1, minutes);
}

export async function createZoomMeeting(input: {
  connectionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await fetch(`${ZOOM_API}/users/me/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: input.title.slice(0, 200),
      type: 2,
      start_time: new Date(input.startsAt).toISOString(),
      duration: durationMinutes(input.startsAt, input.endsAt),
      timezone: "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        meeting_authentication: false,
        approval_type: 2,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`zoom_meeting_create:${response.status}:${text.slice(0, 240)}`);
  }
  const meeting = (await response.json()) as {
    id?: number | string;
    join_url?: string;
  };
  const id = meeting.id == null ? null : String(meeting.id);
  const meetJoinUrl = meeting.join_url?.startsWith("https://")
    ? meeting.join_url
    : null;
  return {
    conferenceId: id ? toZoomConferenceId(id) : null,
    meetJoinUrl,
  };
}

export async function updateZoomMeeting(input: {
  connectionId: string;
  conferenceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const meetingId = zoomMeetingIdFromConference(input.conferenceId);
  const response = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: input.title.slice(0, 200),
        start_time: new Date(input.startsAt).toISOString(),
        duration: durationMinutes(input.startsAt, input.endsAt),
        timezone: "UTC",
      }),
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`zoom_meeting_update:${response.status}:${text.slice(0, 240)}`);
  }
}

export async function deleteZoomMeeting(input: {
  connectionId: string;
  conferenceId: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const meetingId = zoomMeetingIdFromConference(input.conferenceId);
  const response = await fetch(
    `${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`zoom_meeting_delete:${response.status}:${text.slice(0, 240)}`);
  }
}
