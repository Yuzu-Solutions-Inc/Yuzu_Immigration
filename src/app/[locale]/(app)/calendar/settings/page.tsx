import { ChevronLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CalendarSettingsPage } from "@/components/booking/calendar-settings-page";
import { GoogleCallbackToast } from "@/components/booking/google-callback-toast";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import {
  getBookingSettings,
  getMyGoogleCalendarConnection,
  listAvailabilityRules,
} from "@/lib/booking/queries";
import { googleCalendarConfigured } from "@/lib/google/oauth";
import { cn } from "@/lib/utils";

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
  const t = await getTranslations("calendar");

  const membership = await getPrimaryMembership();
  const [settings, rules, googleConnection] = await Promise.all([
    getBookingSettings(),
    listAvailabilityRules(),
    getMyGoogleCalendarConnection(),
  ]);

  return (
    <div className="space-y-6">
      <GoogleCallbackToast status={googleStatus} />
      <div className="space-y-3">
        <Link
          href="/calendar"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 w-fit gap-1 text-muted-foreground",
          )}
        >
          <ChevronLeft className="size-4" />
          {t("backToCalendar")}
        </Link>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("settingsTitle")}
          </h1>
        </div>
      </div>
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
