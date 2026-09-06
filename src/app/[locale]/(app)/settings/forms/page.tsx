import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { FormVersionsPanel } from "@/components/settings/form-versions-panel";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { isModuleEnabled } from "@/lib/modules/org-modules";

export default async function FormVersionsSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!isModuleEnabled(membership.enabledModules, "immigration")) {
    redirect(`/${locale}/settings/account`);
  }

  return <FormVersionsPanel locale={locale} />;
}
