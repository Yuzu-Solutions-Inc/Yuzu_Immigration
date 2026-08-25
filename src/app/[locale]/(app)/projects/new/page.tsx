import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { listOrgMembers, listPeople } from "@/lib/crm/queries";
import { listOrganizationPrograms } from "@/app/actions/org-programs";
import { listProjectContractsCatalog } from "@/app/actions/project-contracts";

export default async function NewProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const { locale } = await params;
  const { person: presetPersonId } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("projects");
  const membership = await getPrimaryMembership();
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/projects`);
  }
  const [people, members, user, organizationPrograms, contractTemplates] =
    await Promise.all([
    listPeople(),
    listOrgMembers(),
    getSessionUser(),
    listOrganizationPrograms(),
    listProjectContractsCatalog(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/projects"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("createTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("createSubtitle")}</p>
      </div>

      <SurfaceCard>
        <CreateProjectForm
          locale={locale}
          people={people}
          members={members.map((m) => ({
            user_id: m.user_id,
            full_name: m.profile.full_name,
            email: m.profile.email,
          }))}
          currentUserId={user?.id}
          presetPersonId={presetPersonId}
          organizationPrograms={organizationPrograms}
          contractTemplates={contractTemplates}
        />
      </SurfaceCard>
    </div>
  );
}
