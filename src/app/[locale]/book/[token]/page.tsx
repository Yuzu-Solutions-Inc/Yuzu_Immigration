import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PublicBookingFlow } from "@/components/booking/public-booking-flow";
import { loadPublicBookingContext } from "@/lib/booking/queries";
import { refreshGoogleBusyIfStale } from "@/lib/google/calendar";

export default async function PublicBookPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking");
  const ctx = await loadPublicBookingContext(token);

  if (ctx) {
    after(() => refreshGoogleBusyIfStale(ctx.organizationId));
  }

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
    <PublicBookingFlow
      locale={locale}
      payload={{
        token,
        organizationName: ctx.organizationName,
        timezone: ctx.settings.timezone,
        bookingWindowDays: ctx.settings.booking_window_days,
        minNoticeHours: ctx.settings.min_notice_hours,
        bufferMinutes: ctx.settings.buffer_minutes,
        services: ctx.services,
        formFields: ctx.formFields,
        hosts: ctx.hosts,
      }}
    />
  );
}
