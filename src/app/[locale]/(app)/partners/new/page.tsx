import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { PartnerForm } from "@/components/partners/partner-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { isModuleEnabled } from "@/lib/modules/org-modules";

export default async function NewPartnerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/partners`);
  }

  const t = await getTranslations("financeApp");
  const financeOn = isModuleEnabled(membership.enabledModules, "finance");
  const immigrationOn = isModuleEnabled(membership.enabledModules, "immigration");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/partners"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("partners.back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("partners.new")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("partners.createSubtitle")}
        </p>
      </div>

      <SurfaceCard>
        <PartnerForm
          locale={locale}
          financeOn={financeOn}
          immigrationOn={immigrationOn}
        />
      </SurfaceCard>
    </div>
  );
}
