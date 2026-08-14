import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { listOrganizationPrograms } from "@/app/actions/org-programs";
import { ProgramTemplatesManager } from "@/components/projects/program-templates-manager";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";

export default async function ProjectTemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }

  const programs = await listOrganizationPrograms();

  return (
    <ProgramTemplatesManager
      locale={locale}
      programs={programs}
      canManage={canCreateRecords(membership.role)}
    />
  );
}
