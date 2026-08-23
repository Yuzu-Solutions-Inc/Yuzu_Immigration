import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BookingsList } from "@/components/booking/bookings-list";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  countOrgBookings,
  listOrgBookingsPage,
  parseBookingPaymentFilter,
} from "@/lib/booking/bookings-list";
import { listBookingServices } from "@/lib/booking/queries";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { listOrgMembers } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

export default async function BookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { payment } = await searchParams;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const orgId = membership.organization.id;
  const supabase = await createClient();
  const [{ data: settings }, members, services, orgTotal] = await Promise.all([
    supabase
      .from("booking_settings")
      .select("timezone")
      .eq("organization_id", orgId)
      .maybeSingle(),
    listOrgMembers(),
    listBookingServices(),
    countOrgBookings(orgId),
  ]);
  const timezone = settings?.timezone ?? "America/Toronto";
  const paymentFilter = parseBookingPaymentFilter(payment);
  const timeFilter = paymentFilter === "pending" ? "all" : "upcoming";
  const bookings = await listOrgBookingsPage(
    orgId,
    {
      time: timeFilter,
      payment: paymentFilter,
      timezone,
      locale,
      sortKey: "starts_at",
      sortDir: "asc",
    },
  );
  const t = await getTranslations("bookings");

  return (
    <div className={listPageClassName}>
      <div className={listPageHeaderClassName}>
        <h1 className={listPageTitleClassName}>
          {t("title")}
        </h1>
        <p className={listPageSubtitleClassName}>
          {t("subtitle")}
        </p>
      </div>
      <BookingsList
        locale={locale}
        canManage={canCreateInWorkspace(membership)}
        currentUserId={user.id}
        timezone={timezone}
        hasAny={orgTotal > 0}
        initial={bookings}
        initialPayment={paymentFilter}
        initialTime={timeFilter}
        serviceOptions={services.map((service) => ({
          id: service.id,
          title: serviceTitle(service, locale),
        }))}
        hostOptions={members.map((member) => ({
          id: member.user_id,
          name:
            member.profile.full_name?.trim() ||
            member.profile.email ||
            member.user_id,
        }))}
      />
    </div>
  );
}
