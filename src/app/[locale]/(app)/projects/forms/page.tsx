import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { CustomFormCatalog } from "@/components/custom-forms/custom-form-catalog";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { listCustomFormTemplates } from "@/lib/custom-forms/queries";

export default async function CustomFormsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);

  const templates = await listCustomFormTemplates(membership.organization.id);

  return (
    <CustomFormCatalog
      locale={locale}
      templates={templates}
      canManage={canCreateInWorkspace(membership)}
    />
  );
}
