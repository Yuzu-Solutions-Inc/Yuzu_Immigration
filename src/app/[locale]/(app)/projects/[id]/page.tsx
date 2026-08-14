import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectDocumentsPanel } from "@/components/documents/project-documents-panel";
import { ProjectFormCompletion } from "@/components/forms/project-form-completion";
import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import {
  ExportProjectFileButton,
  ProjectRetentionPanel,
} from "@/components/privacy/retention-export";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectAssistantShare } from "@/components/projects/project-assistant-share";
import { ProjectStatusCard } from "@/components/projects/project-status-update-form";
import { ProjectSubmitBeforeCard } from "@/components/projects/project-submit-before-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  canAdministerOrg,
  canDeleteRecord,
  canShareProjects,
} from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  getProject,
  getProjectParticipants,
  getProjectStatusHistory,
  listOrgMembers,
  listProjectAssistantUserIds,
} from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { ensureProjectDocumentsSeeded } from "@/lib/documents/service";
import { listProjectDocumentRequests } from "@/lib/documents/service";
import { normalizeAnswersStore } from "@/lib/ircc/answers-store";
import { isFormMandatoryComplete } from "@/lib/ircc/form-readiness";
import { PROFILE_REP_SELECT } from "@/lib/ircc/account-rep";
import {
  getActiveShareLink,
  getProjectFormAnswers,
  listProjectForms,
} from "@/lib/ircc/project-forms";
import { buildQuestionnairePeople } from "@/lib/ircc/questionnaire-people";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const appLocale = toAppLocale(locale);

  const project = await getProject(id);
  if (!project) notFound();

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  const canShare = canShareProjects(membership?.role);
  const canDelete = canDeleteRecord({
    role: membership?.role,
    createdBy: project.created_by,
    actorUserId: user?.id,
  });

  await ensureProjectFormsSeeded(
    project.organization_id,
    project.id,
    project.program_family,
  );
  await ensureProjectDocumentsSeeded(
    project.organization_id,
    project.id,
    project.program_family,
  );

  const [participants, history, forms, answersRow, share, documentRequests, members, assistantIds] =
    await Promise.all([
      getProjectParticipants(id),
      getProjectStatusHistory(id),
      listProjectForms(id),
      getProjectFormAnswers(id),
      getActiveShareLink(id),
      listProjectDocumentRequests(id),
      canShare ? listOrgMembers() : Promise.resolve([]),
      canShare ? listProjectAssistantUserIds(id) : Promise.resolve([]),
    ]);
  const t = await getTranslations("projects");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");
  const formLocale = locale === "fr" ? "fr" : "en";
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

  const questionnairePeople = buildQuestionnairePeople({
    participants,
    forms,
    store,
    formLanguage: project.form_language,
    repProfile,
  });

  const principalAnswers =
    questionnairePeople.find((person) => person.role === "principal")
      ?.answers ??
    questionnairePeople[0]?.answers ??
    {};
  const todoForms = forms.map((form) => {
    const answers = form.person_id
      ? (questionnairePeople.find((person) => person.id === form.person_id)
          ?.answers ?? principalAnswers)
      : principalAnswers;
    return {
      ...form,
      mandatoryReady: isFormMandatoryComplete(form.form_code, answers),
    };
  });

  const opened = new Date(project.opened_at).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/projects"
            className="text-sm font-medium text-action hover:underline"
          >
            ← {t("back")}
          </Link>
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {project.title}
          </h1>
          <p className="text-[15px] text-muted-foreground">
            {project.organization_program_name ||
              tprog(project.program_family)}
            {project.jurisdiction !== "federal"
              ? ` · ${t(`jurisdictions.${project.jurisdiction}`)}`
              : ""}{" "}
            ·{" "}
            {t(`formLanguages.${project.form_language === "fr" ? "fr" : "en"}`)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("opened")} {opened}
            {" · "}
            {t("representative")}{" "}
            {project.representative?.full_name ||
              project.representative?.email ||
              t("representativeUnassigned")}
          </p>
          {project.description ? (
            <p className="max-w-2xl text-sm text-brand/80">
              {project.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExportProjectFileButton locale={locale} projectId={project.id} />
            <Link
              href={`/projects/${project.id}/edit`}
              className={cn(
                buttonVariants({ size: "sm" }),
                "bg-action text-white hover:bg-action/90",
              )}
            >
              {t("edit")}
            </Link>
            {canDelete ? (
              <DeleteProjectButton
                locale={locale}
                projectId={project.id}
                title={project.title}
              />
            ) : null}
          </div>
          <div className="grid grid-cols-[auto_auto_1.75rem] items-center gap-x-2.5 gap-y-1">
            <ProjectStatusCard
              locale={locale}
              projectId={project.id}
              currentStatus={project.status}
              currentStatusAt={project.status_at}
              history={history}
            />
            <ProjectSubmitBeforeCard
              locale={locale}
              projectId={project.id}
              currentSubmitBefore={project.submit_before}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("notes")}
        </p>
        {project.notes ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-brand" title={project.notes}>
            {project.notes}
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("notesEmpty")}
          </p>
        )}
      </div>

      <ProjectRetentionPanel
        locale={appLocale}
        projectId={project.id}
        closedAt={project.closed_at}
        retainUntil={project.retain_until}
        destroyedAt={project.destroyed_at}
        canAdminister={canAdministerOrg(membership?.role)}
      />

      {canShare ? (
        <ProjectAssistantShare
          locale={locale}
          projectId={project.id}
          assistants={members
            .filter((m) => m.role === "assistant")
            .map((m) => ({
              user_id: m.user_id,
              full_name: m.profile.full_name,
              email: m.profile.email,
            }))}
          selectedUserIds={assistantIds}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("participants")}
              </h2>
              <Link
                href={`/projects/${project.id}/edit`}
                className="text-sm font-medium text-action hover:underline"
              >
                {t("editPeople")}
              </Link>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
              {participants.map((row) => (
                <li key={row.id}>
                  {row.person ? (
                    <Link
                      href={`/people/${row.person.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/60"
                    >
                      <div>
                        <p className="font-medium text-brand">
                          {row.person.first_name} {row.person.last_name}
                        </p>
                        {row.person.email ? (
                          <p className="text-sm text-muted-foreground">
                            {row.person.email}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {tr(row.role)}
                      </span>
                    </Link>
                  ) : (
                    <div className="px-5 py-4 text-sm text-muted-foreground">
                      {tr(row.role)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div id="documents" className="scroll-mt-20">
            <ProjectDocumentsPanel
              locale={locale}
              projectId={project.id}
              requests={documentRequests}
              people={questionnairePeople.map((p) => ({
                id: p.id,
                displayName: p.displayName,
                role: p.role,
              }))}
            />
          </div>
        </div>

        <div id="forms" className="min-w-0 scroll-mt-20">
          <ProjectFormsPanel
            locale={formLocale}
            projectId={project.id}
            programFamily={project.program_family}
            forms={todoForms}
            people={questionnairePeople}
            activeShareExpiresAt={share?.expires_at ?? null}
            shareCanReveal={share?.canReveal ?? false}
          />
        </div>
      </div>

      <div id="questionnaire" className="scroll-mt-20">
        <ProjectFormCompletion
          projectId={project.id}
          people={questionnairePeople}
        />
      </div>
    </div>
  );
}
