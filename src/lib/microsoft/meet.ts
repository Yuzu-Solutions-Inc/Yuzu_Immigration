import { getValidAccessToken } from "@/lib/microsoft/calendar";

function toGraphDateTime(iso: string) {
  return new Date(iso).toISOString();
}

export async function createTeamsOnlineMeeting(input: {
  connectionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/onlineMeetings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: input.title,
        startDateTime: toGraphDateTime(input.startsAt),
        endDateTime: toGraphDateTime(input.endsAt),
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `teams_online_meeting:${response.status}:${text.slice(0, 240)}`,
    );
  }
  const meeting = (await response.json()) as {
    id?: string;
    joinWebUrl?: string;
    joinUrl?: string;
  };
  const meetJoinUrl =
    meeting.joinWebUrl?.startsWith("https://")
      ? meeting.joinWebUrl
      : meeting.joinUrl?.startsWith("https://")
        ? meeting.joinUrl
        : null;
  return {
    conferenceId: meeting.id ?? null,
    meetJoinUrl,
  };
}

export async function updateTeamsOnlineMeeting(input: {
  connectionId: string;
  conferenceId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(input.conferenceId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: input.title,
        startDateTime: toGraphDateTime(input.startsAt),
        endDateTime: toGraphDateTime(input.endsAt),
      }),
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `teams_online_meeting_update:${response.status}:${text.slice(0, 240)}`,
    );
  }
}

export async function deleteTeamsOnlineMeeting(input: {
  connectionId: string;
  conferenceId: string;
}) {
  const accessToken = await getValidAccessToken(input.connectionId);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/onlineMeetings/${encodeURIComponent(input.conferenceId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `teams_online_meeting_delete:${response.status}:${text.slice(0, 240)}`,
    );
  }
}
