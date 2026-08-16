import { getValidAccessToken } from "@/lib/google/calendar";

export async function createGoogleMeetSpace(connectionId: string) {
  const accessToken = await getValidAccessToken(connectionId);
  const response = await fetch("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config: {
        accessType: "OPEN",
        entryPointAccess: "ALL",
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_meet_space:${response.status}:${text.slice(0, 240)}`);
  }
  const space = (await response.json()) as {
    name?: string;
    meetingUri?: string;
  };
  const meetJoinUrl = space.meetingUri?.startsWith("https://")
    ? space.meetingUri
    : null;
  return {
    conferenceId: space.name ?? null,
    meetJoinUrl,
  };
}
