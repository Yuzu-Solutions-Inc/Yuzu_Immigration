import { setRequestLocale } from "next-intl/server";

import { CalendarSettingsPage } from "@/components/booking/calendar-settings-page";
import { GoogleCallbackToast } from "@/components/booking/google-callback-toast";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import {
  getBookingSettings,
  getMyGoogleCalendarConnection,
  listAvailabilityRules,
} from "@/lib/booking/queries";
import { googleCalendarConfigured } from "@/lib/google/oauth";

export default async function CalendarSettingsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ google?: string }>;
}) {
  const { locale } = await params;
  const { google: googleStatus } = await searchParams;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const [settings, rules, googleConnection] = await Promise.all([
    getBookingSettings(),
    listAvailabilityRules(),
    getMyGoogleCalendarConnection(),
  ]);

  return (
    <div className="space-y-6">
      <GoogleCallbackToast status={googleStatus} />
      <CalendarSettingsPage
        locale={locale}
        canManage={canCreateRecords(membership?.role)}
        settings={settings}
        rules={rules}
        googleConfigured={googleCalendarConfigured()}
        googleConnection={googleConnection}
      />
    </div>
  );
}
