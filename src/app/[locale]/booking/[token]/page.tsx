import { getTranslations, setRequestLocale } from "next-intl/server";

import { ManageBookingFlow } from "@/components/booking/manage-booking-flow";
import {
  loadManageBookingContext,
  toManageBookingPayload,
} from "@/lib/booking/queries";

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const { locale, token } = await params;
  const { action } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("bookingManage");
  const ctx = await loadManageBookingContext(token);

  if (!ctx) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("unavailableTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("unavailableBody")}
        </p>
      </div>
    );
  }

  return (
    <ManageBookingFlow
      locale={locale}
      payload={toManageBookingPayload(token, ctx)}
      initialAction={action}
    />
  );
}
