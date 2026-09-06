import { getTranslations } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import { requireModule } from "@/lib/modules/require-module";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function BillingProjectsPlaceholderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  const locale = toAppLocale(localeParam);
  await requireModule(locale, "finance");
  const t = await getTranslations("modules");

  return (
    <SurfaceCard className="space-y-2 sm:p-6">
      <h1 className="font-heading text-xl font-semibold text-brand">
        {t("items.finance.name")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("financeComingSoon")}</p>
    </SurfaceCard>
  );
}
