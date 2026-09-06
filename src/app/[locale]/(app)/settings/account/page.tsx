import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CalendarSettingsPage } from "@/components/booking/calendar-settings-page";
import { GoogleCallbackToast } from "@/components/booking/google-callback-toast";
import { MicrosoftCallbackToast } from "@/components/booking/microsoft-callback-toast";
import { ZoomCallbackToast } from "@/components/booking/zoom-callback-toast";
import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { hasEmailPasswordAuth } from "@/lib/auth/providers";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { loadCalendarSettingsModel } from "@/lib/booking/calendar-settings-data";
import { toAppLocale } from "@/lib/i18n/locales";
import { isAccountRepComplete } from "@/lib/ircc/account-rep";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { createClient } from "@/lib/supabase/server";

export default async function AccountSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ google?: string; microsoft?: string; zoom?: string }>;
}) {
  const { locale: localeParam } = await params;
  const {
    google: googleStatus,
    microsoft: microsoftStatus,
    zoom: zoomStatus,
  } = await searchParams;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const membership = await getPrimaryMembership();
  const bookingsOn = Boolean(
    membership && isModuleEnabled(membership.enabledModules, "bookings"),
  );

  const supabase = await createClient();
  const [{ data: profile }, calendar] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, email, rep_family_name, rep_given_name, rep_organization, rep_email, rep_phone, rep_phone_country_code, rep_membership_id, rep_street_num, rep_street_name, rep_city, rep_province, rep_country, rep_postal_code",
      )
      .eq("id", user.id)
      .maybeSingle(),
    bookingsOn
      ? loadCalendarSettingsModel()
      : Promise.resolve(null),
  ]);

  const t = await getTranslations("settings");

  return (
    <div className="space-y-4">
      <GoogleCallbackToast status={googleStatus} />
      <MicrosoftCallbackToast status={microsoftStatus} />
      <ZoomCallbackToast status={zoomStatus} />
      <SurfaceCard className="space-y-4 sm:p-6">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("account")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("accountHelp")}</p>
        </div>
        <AccountSettingsForm
          locale={locale}
          email={profile?.email || user.email || ""}
          fullName={profile?.full_name || ""}
          canChangePassword={hasEmailPasswordAuth(user)}
          representative={{
            repFamilyName: profile?.rep_family_name ?? "",
            repGivenName: profile?.rep_given_name ?? "",
            repOrganization: profile?.rep_organization ?? "",
            repEmail: profile?.rep_email ?? "",
            repPhone: profile?.rep_phone ?? "",
            repPhoneCountryCode: profile?.rep_phone_country_code ?? "",
            repMembershipId: profile?.rep_membership_id ?? "",
            repStreetNum: profile?.rep_street_num ?? "",
            repStreetName: profile?.rep_street_name ?? "",
            repCity: profile?.rep_city ?? "",
            repProvince: profile?.rep_province ?? "",
            repCountry: profile?.rep_country ?? "Canada",
            repPostalCode: profile?.rep_postal_code ?? "",
          }}
          representativeComplete={isAccountRepComplete(profile)}
        />
      </SurfaceCard>
      {calendar ? (
        <CalendarSettingsPage
          locale={localeParam}
          canManage={calendar.canManage}
          settings={calendar.settings}
          rules={calendar.rules}
          googleConfigured={calendar.googleConfigured}
          googleConnection={calendar.googleConnection}
          microsoftConfigured={calendar.microsoftConfigured}
          microsoftConnection={calendar.microsoftConnection}
          zoomConfigured={calendar.zoomConfigured}
          zoomConnection={calendar.zoomConnection}
          calendarProvider={calendar.calendarProvider}
          meetingProvider={calendar.meetingProvider}
        />
      ) : null}
    </div>
  );
}
