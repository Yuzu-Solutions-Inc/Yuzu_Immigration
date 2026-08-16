import { getAppBaseUrl } from "@/lib/app-url";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  getUserGoogleConnection,
  startGoogleWatch,
  stopGoogleWatch,
  syncGoogleBusy,
} from "@/lib/google/calendar";
import {
  getUserMicrosoftConnection,
  startMicrosoftWatch,
  stopMicrosoftWatch,
  syncMicrosoftBusy,
} from "@/lib/microsoft/calendar";

/** Start or stop calendar webhooks to match the staff calendar provider. */
export async function applyCalendarProviderWatches(
  organizationId: string,
  userId: string,
) {
  const integrations = await getStaffBookingIntegrations(
    organizationId,
    userId,
  );
  const calendar = integrations?.calendar_provider ?? null;
  const [google, microsoft] = await Promise.all([
    getUserGoogleConnection(organizationId, userId),
    getUserMicrosoftConnection(organizationId, userId),
  ]);
  const origin = await getAppBaseUrl();
  const https = origin.startsWith("https://");

  if (calendar === "google" && google) {
    try {
      await syncGoogleBusy(google);
    } catch (error) {
      console.error("google calendar watch sync:", error);
    }
    if (https) {
      try {
        await startGoogleWatch(google, `${origin}/api/calendar/google/webhook`);
      } catch (error) {
        console.error("google calendar watch start:", error);
      }
    }
  } else if (google) {
    try {
      await stopGoogleWatch(google);
    } catch (error) {
      console.error("google calendar watch stop:", error);
    }
  }

  if (calendar === "microsoft" && microsoft) {
    try {
      await syncMicrosoftBusy(microsoft);
    } catch (error) {
      console.error("microsoft calendar watch sync:", error);
    }
    if (https) {
      try {
        await startMicrosoftWatch(
          microsoft,
          `${origin}/api/calendar/microsoft/webhook`,
        );
      } catch (error) {
        console.error("microsoft calendar watch start:", error);
      }
    }
  } else if (microsoft) {
    try {
      await stopMicrosoftWatch(microsoft);
    } catch (error) {
      console.error("microsoft calendar watch stop:", error);
    }
  }
}
