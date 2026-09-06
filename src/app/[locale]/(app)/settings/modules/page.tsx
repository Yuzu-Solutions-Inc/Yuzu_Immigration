import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { OrganizationModulesForm } from "@/components/settings/organization-modules-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function OrganizationModulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canAdministerOrg(membership.role)) {
    redirect(`/${locale}/settings/account`);
  }

  const t = await getTranslations("modules");

  return (
    <SurfaceCard className="space-y-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <OrganizationModulesForm initialEnabled={membership.enabledModules} />
    </SurfaceCard>
  );
}
