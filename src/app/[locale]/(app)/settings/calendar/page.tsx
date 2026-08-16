import { setRequestLocale } from "next-intl/server";

import { CalendarSettingsPage } from "@/components/booking/calendar-settings-page";
import { GoogleCallbackToast } from "@/components/booking/google-callback-toast";
import { MicrosoftCallbackToast } from "@/components/booking/microsoft-callback-toast";
import { ZoomCallbackToast } from "@/components/booking/zoom-callback-toast";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  getBookingSettings,
  getMyGoogleCalendarConnection,
  getMyMicrosoftCalendarConnection,
  getMyZoomConnection,
  listAvailabilityRules,
} from "@/lib/booking/queries";
import { googleCalendarConfigured } from "@/lib/google/oauth";
import { microsoftCalendarConfigured } from "@/lib/microsoft/oauth";
import { zoomConfigured } from "@/lib/zoom/oauth";

export default async function SettingsCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ google?: string; microsoft?: string; zoom?: string }>;
}) {
  const { locale } = await params;
  const {
    google: googleStatus,
    microsoft: microsoftStatus,
    zoom: zoomStatus,
  } = await searchParams;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  const [
    settings,
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

  return (
    <div className="space-y-6">
      <GoogleCallbackToast status={googleStatus} />
      <MicrosoftCallbackToast status={microsoftStatus} />
      <ZoomCallbackToast status={zoomStatus} />
      <CalendarSettingsPage
        locale={locale}
        canManage={canCreateRecords(membership?.role)}
        settings={settings}
        rules={rules}
        googleConfigured={googleCalendarConfigured()}
        googleConnection={googleConnection}
        microsoftConfigured={microsoftCalendarConfigured()}
        microsoftConnection={microsoftConnection}
        zoomConfigured={zoomConfigured()}
        zoomConnection={zoomConnection}
        calendarProvider={integrations?.calendar_provider ?? null}
        meetingProvider={integrations?.meeting_provider ?? null}
      />
    </div>
  );
}
