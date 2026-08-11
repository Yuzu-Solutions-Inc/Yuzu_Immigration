import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { getProject } from "@/lib/crm/queries";
import {
  getActiveShareLink,
  getProjectFormAnswers,
  listProjectForms,
} from "@/lib/ircc/project-forms";

export default async function ProjectFormsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const project = await getProject(id);
  if (!project) notFound();

  await ensureProjectFormsSeeded(
    project.organization_id,
    project.id,
    project.program_family,
  );

  const [forms, answersRow, share] = await Promise.all([
    listProjectForms(id),
    getProjectFormAnswers(id),
    getActiveShareLink(id),
  ]);
  const t = await getTranslations("forms");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link
          href={`/projects/${project.id}`}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToProject")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("pageTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{project.title}</p>
      </div>

      <SurfaceCard className="sm:p-6">
        <ProjectFormsPanel
          locale={locale === "fr" ? "fr" : "en"}
          projectId={project.id}
          forms={forms}
          answers={answersRow?.answers ?? {}}
          activeShareExpiresAt={share?.expires_at ?? null}
        />
      </SurfaceCard>
    </div>
  );
}
