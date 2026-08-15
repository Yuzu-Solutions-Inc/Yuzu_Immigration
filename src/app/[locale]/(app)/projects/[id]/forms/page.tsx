import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectQuestionnaire } from "@/components/forms/project-forms-panel";
import { Link } from "@/i18n/navigation";
import { getProject, getProjectParticipants } from "@/lib/crm/queries";
import {
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import { normalizeAnswersStore } from "@/lib/ircc/answers-store";
import {
  getProjectFormAnswers,
  listProjectForms,
} from "@/lib/ircc/project-forms";
import { buildQuestionnairePeople } from "@/lib/ircc/questionnaire-people";
import { createClient } from "@/lib/supabase/server";

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

  const [participants, forms, answersRow, t] = await Promise.all([
    getProjectParticipants(id),
    listProjectForms(id),
    getProjectFormAnswers(id),
    getTranslations("forms"),
  ]);

  const principal = participants.find((p) => p.role === "principal");
  const store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: principal?.person?.id,
  });

  const supabase = await createClient();
  const { data: repProfile } = project.representative_user_id
    ? await supabase
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", project.representative_user_id)
        .maybeSingle()
    : { data: null };

  const formLocale = locale === "fr" ? "fr" : "en";
  const people = buildQuestionnairePeople({
    participants,
    forms,
    store,
    formLanguage: project.form_language,
    repProfile,
  });

  return (
    <div className="space-y-6">
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

      <ProjectQuestionnaire
        locale={formLocale}
        projectId={project.id}
        people={people}
        modificationBlocked={project.status === "granted"}
      />
    </div>
  );
}
