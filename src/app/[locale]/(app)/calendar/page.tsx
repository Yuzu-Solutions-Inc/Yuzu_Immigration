import { after } from "next/server";
import { setRequestLocale } from "next-intl/server";

import {
  CalendarEmptyHint,
  CalendarWorkspace,
} from "@/components/booking/calendar-workspace";
import { fillPageClassName } from "@/components/layout/list-layout";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import {
  getBookingSettings,
  listAppointmentsInRange,
  listAvailabilityRules,
  listBlockedTimes,
  listBookingServices,
  listGoogleBusy,
  listMicrosoftBusy,
  listServiceFormFields,
} from "@/lib/booking/queries";
import { listOrgMembers } from "@/lib/crm/queries";
import { addDaysToIsoDate, zonedDateIso } from "@/lib/booking/timezone";
import { refreshHostCalendarsIfStale } from "@/lib/calendar/host-calendar";
import { requireBookingsWorkspace } from "@/lib/modules/require-workspace";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireBookingsWorkspace(locale);

  const [membership, user] = await Promise.all([
    getPrimaryMembership(),
    getSessionUser(),
  ]);
  const canManage = canCreateInWorkspace(membership);
  const [settings, rules, services, formFields] = await Promise.all([
    getBookingSettings(),
    listAvailabilityRules(),
    listBookingServices(),
    listServiceFormFields(),
  ]);

  const timeZone = settings?.timezone ?? "America/Toronto";
  const todayIso = zonedDateIso(new Date(), timeZone);
  const fromIso = `${addDaysToIsoDate(todayIso, -60)}T00:00:00.000Z`;
  const toIso = `${addDaysToIsoDate(todayIso, 150)}T00:00:00.000Z`;
  const [appointments, blocked, googleBusy, microsoftBusy, members] =
    await Promise.all([
    listAppointmentsInRange(fromIso, toIso),
    listBlockedTimes(fromIso, toIso),
    listGoogleBusy(fromIso, toIso),
    listMicrosoftBusy(fromIso, toIso),
    listOrgMembers(),
  ]);

  const hostNames = Object.fromEntries(
    members.map((member) => [
      member.user_id,
      member.profile.full_name || member.profile.email || member.user_id,
    ]),
  );

  const orgId = membership?.organization.id;
  if (orgId) {
    after(() => refreshHostCalendarsIfStale(orgId));
  }

  const showSetupHint = rules.length === 0 || services.length === 0;

  return (
    <div className={fillPageClassName}>
      {showSetupHint ? (
        <div className="shrink-0 pb-3">
          <CalendarEmptyHint hasServices={services.length > 0} />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CalendarWorkspace
          locale={locale}
          canManage={canManage}
          currentUserId={user?.id ?? ""}
          settings={settings}
          rules={rules}
          appointments={appointments}
          blocked={blocked}
          googleBusy={googleBusy}
          microsoftBusy={microsoftBusy}
          formFields={formFields}
          hostNames={hostNames}
          fillViewport
        />
      </div>
    </div>
  );
}
