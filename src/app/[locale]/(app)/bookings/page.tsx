import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BookingsList } from "@/components/booking/bookings-list";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listOrgBookingsWithPayment } from "@/lib/booking/bookings-list";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);

  const bookings = await listOrgBookingsWithPayment(
    membership.organization.id,
    { locale },
  );
  const t = await getTranslations("bookings");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>
      <BookingsList locale={locale} bookings={bookings} />
    </div>
  );
}
