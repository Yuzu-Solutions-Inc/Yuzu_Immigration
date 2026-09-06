import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  getBookingSettings,
  getMyGoogleCalendarConnection,
  getMyMicrosoftCalendarConnection,
  getMyZoomConnection,
  listAvailabilityRules,
} from "@/lib/booking/queries";
import { ensureBookingSettings } from "@/lib/booking/settings";
import { googleCalendarConfigured } from "@/lib/google/oauth";
import { microsoftCalendarConfigured } from "@/lib/microsoft/oauth";
import { createClient } from "@/lib/supabase/server";
import { zoomConfigured } from "@/lib/zoom/oauth";

export async function loadCalendarSettingsModel() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  const [
    loadedSettings,
    rules,
    googleConnection,
    microsoftConnection,
    zoomConnection,
    integrations,
  ] = await Promise.all([
    getBookingSettings(),
    listAvailabilityRules(),
    getMyGoogleCalendarConnection(),
    getMyMicrosoftCalendarConnection(),
    getMyZoomConnection(),
    membership && user
      ? getStaffBookingIntegrations(membership.organization.id, user.id)
      : Promise.resolve(null),
  ]);

  let settings = loadedSettings;
  if (!settings && membership && user) {
    const supabase = await createClient();
    settings = await ensureBookingSettings(
      membership.organization.id,
      user.id,
      supabase,
    );
  }

  return {
    canManage: canCreateInWorkspace(membership),
    settings,
    rules,
    googleConfigured: googleCalendarConfigured(),
    googleConnection,
    microsoftConfigured: microsoftCalendarConfigured(),
    microsoftConnection,
    zoomConfigured: zoomConfigured(),
    zoomConnection,
    calendarProvider: integrations?.calendar_provider ?? null,
    meetingProvider: integrations?.meeting_provider ?? null,
  };
}
