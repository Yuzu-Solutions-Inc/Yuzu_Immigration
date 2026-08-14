import { after } from "next/server";
import { setRequestLocale } from "next-intl/server";

import {
  CalendarEmptyHint,
  CalendarWorkspace,
} from "@/components/booking/calendar-workspace";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import {
  getBookingSettings,
  listAppointmentsInRange,
  listAvailabilityRules,
  listBlockedTimes,
  listBookingServices,
  listGoogleBusy,
} from "@/lib/booking/queries";
import { addDaysToIsoDate, zonedDateIso } from "@/lib/booking/timezone";
import { refreshGoogleBusyIfStale } from "@/lib/google/calendar";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const canManage = canCreateRecords(membership?.role);
  const [settings, rules, services] = await Promise.all([
    getBookingSettings(),
    listAvailabilityRules(),
    listBookingServices(),
  ]);

  const timeZone = settings?.timezone ?? "America/Toronto";
  const todayIso = zonedDateIso(new Date(), timeZone);
  const fromIso = `${addDaysToIsoDate(todayIso, -60)}T00:00:00.000Z`;
  const toIso = `${addDaysToIsoDate(todayIso, 150)}T00:00:00.000Z`;
  const [appointments, blocked, googleBusy] = await Promise.all([
    listAppointmentsInRange(fromIso, toIso),
    listBlockedTimes(fromIso, toIso),
    listGoogleBusy(fromIso, toIso),
  ]);

  const orgId = membership?.organization.id;
  if (orgId) {
    after(() => refreshGoogleBusyIfStale(orgId));
  }

  return (
    <div className="space-y-6">
      {rules.length === 0 || services.length === 0 ? (
        <CalendarEmptyHint hasServices={services.length > 0} />
      ) : null}
      <CalendarWorkspace
        locale={locale}
        canManage={canManage}
        settings={settings}
        appointments={appointments}
        blocked={blocked}
        googleBusy={googleBusy}
      />
    </div>
  );
}
