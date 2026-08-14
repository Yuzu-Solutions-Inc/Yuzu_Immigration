import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProjectCallBookingFlow } from "@/components/booking/project-call-booking-flow";
import { loadProjectCallInviteContext } from "@/lib/booking/queries";
import { refreshGoogleBusyIfStale } from "@/lib/google/calendar";

export default async function ProjectCallBookPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projectCall");
  const ctx = await loadProjectCallInviteContext(token);

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

  if (ctx.status !== "open") {
    const title =
      ctx.status === "used"
        ? t("alreadyUsedTitle")
        : ctx.status === "expired"
          ? t("expiredTitle")
          : t("revokedTitle");
    const body =
      ctx.status === "used"
        ? t("alreadyUsedBody")
        : ctx.status === "expired"
          ? t("expiredBody")
          : t("revokedBody");
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {title}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{body}</p>
      </div>
    );
  }

  return (
    <ProjectCallBookingFlow locale={locale} token={token} ctx={ctx} />
  );
}
