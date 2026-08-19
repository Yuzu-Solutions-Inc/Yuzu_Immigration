import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { BookingsList } from "@/components/booking/bookings-list";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listOrgBookingsWithPayment } from "@/lib/booking/bookings-list";
import { toAppLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

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
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden lg:gap-3">
      <div className="shrink-0 space-y-0.5 sm:space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand lg:text-xl">
          {t("title")}
        </h1>
        <p className="hidden text-[15px] text-muted-foreground sm:block lg:text-sm">
          {t("subtitle")}
        </p>
      </div>
      <BookingsList
        locale={locale}
        canManage={canCreateRecords(membership.role)}
        timezone={settings?.timezone ?? "America/Toronto"}
        bookings={bookings}
      />
    </div>
  );
}
