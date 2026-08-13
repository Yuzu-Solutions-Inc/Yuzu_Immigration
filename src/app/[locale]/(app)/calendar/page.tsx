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
} from "@/lib/booking/queries";
import { addDaysToIsoDate, zonedDateIso } from "@/lib/booking/timezone";

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
  const [appointments, blocked] = await Promise.all([
    listAppointmentsInRange(fromIso, toIso),
    listBlockedTimes(fromIso, toIso),
  ]);

  return (
    <div className="space-y-6">
      {rules.length === 0 || services.length === 0 ? (
        <CalendarEmptyHint hasServices={services.length > 0} />
      ) : null}
      <CalendarWorkspace
        locale={locale}
        canManage={canManage}
        settings={settings}
        rules={rules}
        appointments={appointments}
        blocked={blocked}
      />
    </div>
  );
}
