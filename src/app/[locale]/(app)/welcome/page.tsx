import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { getStaffBookingIntegrations } from "@/lib/booking/integrations";
import {
  getMyGoogleCalendarConnection,
  getMyMicrosoftCalendarConnection,
  getMyZoomConnection,
} from "@/lib/booking/queries";
import { googleCalendarConfigured } from "@/lib/google/oauth";
import { toAppLocale } from "@/lib/i18n/locales";
import { microsoftCalendarConfigured } from "@/lib/microsoft/oauth";
import { getOnboardingState } from "@/lib/onboarding/status";
import { zoomConfigured } from "@/lib/zoom/oauth";

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const [membership, user] = await Promise.all([
    getPrimaryMembership(),
    getSessionUser(),
  ]);
  if (!membership || !user) {
    redirect(membership ? `/${locale}/login` : `/${locale}/onboarding`);
  }

  const [
    state,
    googleConnection,
    microsoftConnection,
    zoomConnection,
    integrations,
  ] = await Promise.all([
    getOnboardingState(),
    getMyGoogleCalendarConnection(),
    getMyMicrosoftCalendarConnection(),
    getMyZoomConnection(),
    getStaffBookingIntegrations(membership.organization.id, user.id),
  ]);

  if (!state) redirect(`/${locale}/login`);

  return (
    <WelcomeWizard
      locale={locale}
      isAdmin={state.isAdmin}
      fullName={state.fullName}
      checks={state.checks}
      googleConfigured={googleCalendarConfigured()}
      googleConnection={googleConnection}
      microsoftConfigured={microsoftCalendarConfigured()}
      microsoftConnection={microsoftConnection}
      zoomConfigured={zoomConfigured()}
      zoomConnection={zoomConnection}
      calendarProvider={integrations?.calendar_provider ?? null}
      meetingProvider={integrations?.meeting_provider ?? null}
    />
  );
}
