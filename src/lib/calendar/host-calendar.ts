import { createServiceClient } from "@/lib/supabase/admin";
import {
  getStaffBookingIntegrations,
  type CalendarProvider,
  type MeetingProvider,
} from "@/lib/booking/integrations";
import { createGoogleMeetSpace } from "@/lib/google/meet";
import {
  deleteAppointmentGoogleEvent,
  getUserGoogleConnection,
  pushAppointmentToGoogleCalendar,
  refreshGoogleBusyIfStale,
  updateAppointmentGoogleEvent,
} from "@/lib/google/calendar";
import {
  createTeamsOnlineMeeting,
  deleteTeamsOnlineMeeting,
  updateTeamsOnlineMeeting,
} from "@/lib/microsoft/meet";
import {
  deleteAppointmentMicrosoftEvent,
  getUserMicrosoftConnection,
  pushAppointmentToMicrosoftCalendar,
  refreshMicrosoftBusyIfStale,
  updateAppointmentMicrosoftEvent,
} from "@/lib/microsoft/calendar";
import {
  createZoomMeeting,
  deleteZoomMeeting,
  getUserZoomConnection,
  isZoomConferenceId,
  updateZoomMeeting,
} from "@/lib/zoom/meetings";

export type HostCalendarPushInput = {
  organizationId: string;
  hostUserId: string | null;
  appointmentId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location?: string;
};

export type HostCalendarUpdateInput = HostCalendarPushInput & {
  googleEventId: string | null;
  microsoftEventId: string | null;
  conferenceId?: string | null;
};

export type HostCalendarResult = {
  meetJoinUrl: string | null;
  conferenceId: string | null;
};

function admin() {
  return createServiceClient();
}

async function resolveProviders(
  organizationId: string,
  hostUserId: string,
): Promise<{
  calendar: CalendarProvider | null;
  meeting: MeetingProvider | null;
}> {
  const stored = await getStaffBookingIntegrations(organizationId, hostUserId);
  if (stored) {
    return {
      calendar: stored.calendar_provider,
      meeting: stored.meeting_provider,
    };
  }
  const google = await getUserGoogleConnection(organizationId, hostUserId);
  if (google) return { calendar: "google", meeting: "google_meet" };
  const microsoft = await getUserMicrosoftConnection(organizationId, hostUserId);
  if (microsoft) return { calendar: "microsoft", meeting: "teams" };
  return { calendar: null, meeting: null };
}

function withJoinDetails(
  description: string,
  meetJoinUrl: string | null,
) {
  if (!meetJoinUrl?.startsWith("https://")) return description;
  if (description.includes(meetJoinUrl)) return description;
  return `${description}\n\nJoin: ${meetJoinUrl}`;
}

function isMeetSpaceId(conferenceId: string | null | undefined) {
  return Boolean(conferenceId?.startsWith("spaces/"));
}

async function persistMeetingFields(input: {
  organizationId: string;
  appointmentId: string;
  meetJoinUrl: string | null;
  conferenceId: string | null;
}) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.meetJoinUrl?.startsWith("https://")) {
    patch.meet_join_url = input.meetJoinUrl;
  }
  if (input.conferenceId) {
    patch.conference_id = input.conferenceId;
  }
  if (Object.keys(patch).length === 1) return;
  await admin()
    .from("booking_appointments")
    .update(patch)
    .eq("id", input.appointmentId)
    .eq("organization_id", input.organizationId);
}

async function createStandaloneMeeting(input: {
  organizationId: string;
  hostUserId: string;
  meeting: MeetingProvider;
  calendar: CalendarProvider | null;
  title: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ meetJoinUrl: string | null; conferenceId: string | null }> {
  if (input.meeting === "google_meet" && input.calendar !== "google") {
    const google = await getUserGoogleConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (!google) return { meetJoinUrl: null, conferenceId: null };
    try {
      return await createGoogleMeetSpace(google.id);
    } catch (error) {
      console.error("standalone google meet:", error);
      return { meetJoinUrl: null, conferenceId: null };
    }
  }
  if (input.meeting === "teams" && input.calendar !== "microsoft") {
    const microsoft = await getUserMicrosoftConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (!microsoft) return { meetJoinUrl: null, conferenceId: null };
    try {
      return await createTeamsOnlineMeeting({
        connectionId: microsoft.id,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
    } catch (error) {
      console.error("standalone teams meeting:", error);
      return { meetJoinUrl: null, conferenceId: null };
    }
  }
  if (input.meeting === "zoom") {
    const zoom = await getUserZoomConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (!zoom) return { meetJoinUrl: null, conferenceId: null };
    try {
      return await createZoomMeeting({
        connectionId: zoom.id,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      });
    } catch (error) {
      console.error("zoom meeting create:", error);
      return { meetJoinUrl: null, conferenceId: null };
    }
  }
  return { meetJoinUrl: null, conferenceId: null };
}

/**
 * Creates a meeting (if configured) then writes the booking to the one
 * calendar the host selected. Calendar and meeting vendors may differ.
 */
export async function pushAppointmentToHostCalendars(
  input: HostCalendarPushInput,
): Promise<HostCalendarResult> {
  if (!input.hostUserId) {
    return { meetJoinUrl: null, conferenceId: null };
  }
  const { calendar, meeting } = await resolveProviders(
    input.organizationId,
    input.hostUserId,
  );
  const createMeet = meeting === "google_meet" && calendar === "google";
  const withTeams = meeting === "teams" && calendar === "microsoft";

  const standalone = meeting
    ? await createStandaloneMeeting({
        organizationId: input.organizationId,
        hostUserId: input.hostUserId,
        meeting,
        calendar,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      })
    : { meetJoinUrl: null, conferenceId: null };

  const description = withJoinDetails(input.description, standalone.meetJoinUrl);
  const location = standalone.meetJoinUrl ?? input.location;

  let nativeJoin: string | null = null;
  if (calendar === "google") {
    const created = await pushAppointmentToGoogleCalendar({
      ...input,
      description,
      location,
      createMeet,
    });
    nativeJoin = created?.meetJoinUrl ?? null;
  } else if (calendar === "microsoft") {
    const created = await pushAppointmentToMicrosoftCalendar({
      ...input,
      description,
      location,
      withTeams,
    });
    nativeJoin = created?.meetJoinUrl ?? null;
  }

  const meetJoinUrl =
    standalone.meetJoinUrl ?? nativeJoin ?? null;
  await persistMeetingFields({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    meetJoinUrl,
    conferenceId: standalone.conferenceId,
  });
  return { meetJoinUrl, conferenceId: standalone.conferenceId };
}

export async function updateAppointmentHostCalendarEvents(
  input: HostCalendarUpdateInput,
): Promise<HostCalendarResult> {
  if (!input.hostUserId) {
    return { meetJoinUrl: null, conferenceId: input.conferenceId ?? null };
  }
  const { calendar, meeting } = await resolveProviders(
    input.organizationId,
    input.hostUserId,
  );
  const createMeet = meeting === "google_meet" && calendar === "google";
  const withTeams = meeting === "teams" && calendar === "microsoft";
  const conferenceId = input.conferenceId ?? null;

  if (conferenceId && meeting === "zoom" && isZoomConferenceId(conferenceId)) {
    const zoom = await getUserZoomConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (zoom) {
      try {
        await updateZoomMeeting({
          connectionId: zoom.id,
          conferenceId,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
      } catch (error) {
        console.error("update zoom meeting:", error);
      }
    }
  } else if (conferenceId && meeting === "teams" && !isMeetSpaceId(conferenceId)) {
    const microsoft = await getUserMicrosoftConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (microsoft) {
      try {
        await updateTeamsOnlineMeeting({
          connectionId: microsoft.id,
          conferenceId,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
      } catch (error) {
        console.error("update standalone teams meeting:", error);
      }
    }
  }

  const description = withJoinDetails(input.description, input.location ?? null);
  let nativeJoin: string | null = null;
  if (calendar === "google") {
    const updated = await updateAppointmentGoogleEvent({
      organizationId: input.organizationId,
      hostUserId: input.hostUserId,
      appointmentId: input.appointmentId,
      googleEventId: input.googleEventId,
      title: input.title,
      description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      createMeet,
    });
    nativeJoin = updated?.meetJoinUrl ?? null;
  } else if (calendar === "microsoft") {
    const updated = await updateAppointmentMicrosoftEvent({
      organizationId: input.organizationId,
      hostUserId: input.hostUserId,
      appointmentId: input.appointmentId,
      microsoftEventId: input.microsoftEventId,
      title: input.title,
      description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      withTeams,
    });
    nativeJoin = updated?.meetJoinUrl ?? null;
  }

  const meetJoinUrl =
    (input.location?.startsWith("https://") ? input.location : null) ??
    nativeJoin ??
    null;
  await persistMeetingFields({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    meetJoinUrl,
    conferenceId,
  });
  return { meetJoinUrl, conferenceId };
}

export async function deleteAppointmentHostCalendarEvents(input: {
  organizationId: string;
  hostUserId: string | null;
  googleEventId: string | null;
  microsoftEventId: string | null;
  conferenceId?: string | null;
}) {
  await Promise.all([
    input.googleEventId
      ? deleteAppointmentGoogleEvent({
          organizationId: input.organizationId,
          hostUserId: input.hostUserId,
          googleEventId: input.googleEventId,
        })
      : Promise.resolve(),
    input.microsoftEventId
      ? deleteAppointmentMicrosoftEvent({
          organizationId: input.organizationId,
          hostUserId: input.hostUserId,
          microsoftEventId: input.microsoftEventId,
        })
      : Promise.resolve(),
  ]);

  const conferenceId = input.conferenceId;
  if (!conferenceId || !input.hostUserId || isMeetSpaceId(conferenceId)) {
    return;
  }
  if (isZoomConferenceId(conferenceId)) {
    const zoom = await getUserZoomConnection(
      input.organizationId,
      input.hostUserId,
    );
    if (zoom) {
      try {
        await deleteZoomMeeting({
          connectionId: zoom.id,
          conferenceId,
        });
      } catch (error) {
        console.error("delete zoom meeting:", error);
      }
    }
    return;
  }
  const microsoft = await getUserMicrosoftConnection(
    input.organizationId,
    input.hostUserId,
  );
  if (microsoft) {
    try {
      await deleteTeamsOnlineMeeting({
        connectionId: microsoft.id,
        conferenceId,
      });
    } catch (error) {
      console.error("delete standalone teams meeting:", error);
    }
  }
}

export async function refreshHostCalendarsIfStale(organizationId: string) {
  await Promise.all([
    refreshGoogleBusyIfStale(organizationId),
    refreshMicrosoftBusyIfStale(organizationId),
  ]);
}
