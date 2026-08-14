import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectDocumentsPanel } from "@/components/documents/project-documents-panel";
import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import { ProjectShareLinkCard } from "@/components/forms/project-share-link-card";
import {
  ExportProjectFileButton,
  ProjectRetentionPanel,
} from "@/components/privacy/retention-export";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectAssistantShare } from "@/components/projects/project-assistant-share";
import { ProjectNotesSection } from "@/components/projects/project-notes-section";
import { ProjectParticipantsList } from "@/components/projects/project-participants-list";
import { ProjectScheduleCallCard } from "@/components/projects/project-schedule-call-card";
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
  listProjectNotes,
} from "@/lib/crm/queries";
import {
  listProjectCallInvites,
  listProjectMeetingHistory,
} from "@/lib/booking/queries";
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

  const [
    participants,
    history,
    forms,
    answersRow,
    share,
    documentRequests,
    members,
    assistantIds,
    notes,
    meetings,
    callInvites,
    bookingSettings,
  ] = await Promise.all([
    getProjectParticipants(id),
    getProjectStatusHistory(id),
    listProjectForms(id),
    getProjectFormAnswers(id),
    getActiveShareLink(id),
    listProjectDocumentRequests(id),
    canShare ? listOrgMembers() : Promise.resolve([]),
    canShare ? listProjectAssistantUserIds(id) : Promise.resolve([]),
    listProjectNotes(id),
    listProjectMeetingHistory(id),
    listProjectCallInvites(id),
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("booking_settings")
        .select("timezone")
        .eq("organization_id", project.organization_id)
        .maybeSingle();
      return data;
    })(),
  ]);
  const t = await getTranslations("projects");
  const tprog = await getTranslations("programs");
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
                "bg-action text-action-foreground hover:bg-action/90",
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
          <ProjectParticipantsList
            projectId={project.id}
            people={questionnairePeople}
            participants={participants}
          />

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

          <div id="forms" className="scroll-mt-20">
            <ProjectFormsPanel
              locale={formLocale}
              projectId={project.id}
              programFamily={project.program_family}
              forms={todoForms}
              people={questionnairePeople}
            />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <ProjectShareLinkCard
            locale={formLocale}
            projectId={project.id}
            activeShareExpiresAt={share?.expires_at ?? null}
            canReveal={share?.canReveal ?? false}
          />
          <ProjectScheduleCallCard
            locale={locale}
            projectId={project.id}
            timezone={bookingSettings?.timezone ?? "America/Toronto"}
            canSchedule={Boolean(membership)}
            principalEmail={
              participants.find((row) => row.role === "principal")?.person
                ?.email ?? null
            }
            meetings={meetings}
            invites={callInvites}
          />
          <ProjectNotesSection
            locale={locale}
            projectId={project.id}
            notes={notes}
          />
        </div>
      </div>
    </div>
  );
}
