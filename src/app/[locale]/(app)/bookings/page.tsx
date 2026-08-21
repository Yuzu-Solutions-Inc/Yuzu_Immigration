import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BookingsList } from "@/components/booking/bookings-list";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { listOrgBookingsWithPayment } from "@/lib/booking/bookings-list";
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

  const supabase = await createClient();
  const [{ data: settings }, bookings] = await Promise.all([
    supabase
      .from("booking_settings")
      .select("timezone")
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
    listOrgBookingsWithPayment(membership.organization.id, { locale }),
  ]);
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
        canManage={canCreateRecords(membership.role)}
        currentUserId={user.id}
        timezone={settings?.timezone ?? "America/Toronto"}
        bookings={bookings}
        initialPayment={payment}
      />
    </div>
  );
}
