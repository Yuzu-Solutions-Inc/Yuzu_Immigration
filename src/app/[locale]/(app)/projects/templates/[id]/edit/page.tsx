import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { getOrganizationProgram } from "@/app/actions/org-programs";
import { SurfaceCard } from "@/components/layout/surface-card";
import { OrganizationProgramForm } from "@/components/projects/organization-program-form";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { draftFromOrganizationProgram } from "@/lib/crm/org-programs";
import { listCustomFormTemplates } from "@/lib/custom-forms/queries";

export default async function EditProjectTemplatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }
  if (!canCreateInWorkspace(membership)) {
    redirect(`/${locale}/projects/templates`);
  }

  const program = await getOrganizationProgram(id);
  if (!program || !program.is_active) notFound();

  const catalog = await listCustomFormTemplates(membership.organization.id);

  const t = await getTranslations("orgPrograms");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link
          href="/projects/templates"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToTemplates")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("editTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <SurfaceCard>
        <OrganizationProgramForm
          locale={locale}
          mode="edit"
          programId={program.id}
          initial={draftFromOrganizationProgram(program)}
          customFormCatalog={catalog.map((row) => ({
            id: row.id,
            title: row.title,
          }))}
        />
      </SurfaceCard>
    </div>
  );
}
