import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { listProjectPaymentLinks } from "@/app/actions/project-payment";
import { getOrgSquareConnection } from "@/lib/square/client";
import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectDocumentsPanel } from "@/components/documents/project-documents-panel";
import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import { ProjectShareLinkCard } from "@/components/forms/project-share-link-card";
import {
  ExportProjectFileButton,
  ProjectRetentionPanel,
} from "@/components/privacy/retention-export";
import { ProjectAssistantShare } from "@/components/projects/project-assistant-share";
import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import { ProjectHomeTab } from "@/components/projects/project-home-tab";
import { ProjectNotesSection } from "@/components/projects/project-notes-section";
import { ProjectParticipantsList } from "@/components/projects/project-participants-list";
import { ProjectPaymentsCard } from "@/components/projects/project-payments-card";
import { ProjectScheduleCallCard } from "@/components/projects/project-schedule-call-card";
import { ProjectStatusCard } from "@/components/projects/project-status-update-form";
import { ProjectSubmitBeforeCard } from "@/components/projects/project-submit-before-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  canAdministerOrg,
  canCreateRecords,
  canShareProjects,
} from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import {
  getProject,
  getProjectParticipants,
  getProjectStatusHistory,
  listOrgMembers,
  listProjectAssistantUserIds,
  listProjectNotes,
} from "@/lib/crm/queries";
import { computeProjectProgressFromDetail } from "@/lib/crm/progress";
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
  const canShare = canShareProjects(membership?.role);

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
    projectPayments,
    squareConnection,
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
    listProjectMeetingHistory(id, locale),
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
    listProjectPaymentLinks(id),
    getOrgSquareConnection(project.organization_id),
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
  const { docsDone, docsTotal, formPercent } = computeProjectProgressFromDetail(
    documentRequests,
    forms,
    store,
    principal?.person?.id ?? null,
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
        <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:w-auto sm:items-end">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
          </div>
          <div className="grid w-full grid-cols-[auto_auto_1.75rem] items-center gap-x-2.5 gap-y-1 sm:w-auto">
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

      <ProjectDetailTabs
        panels={{
          home: (
            <ProjectHomeTab
              docsDone={docsDone}
              docsTotal={docsTotal}
              formPercent={formPercent}
              clientLink={
                <ProjectShareLinkCard
                  locale={formLocale}
                  projectId={project.id}
                  activeShareExpiresAt={share?.expires_at ?? null}
                  canReveal={share?.canReveal ?? false}
                />
              }
              participants={
                <ProjectParticipantsList
                  projectId={project.id}
                  people={questionnairePeople}
                  participants={participants}
                />
              }
            />
          ),
          documents: (
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
          ),
          forms: (
            <ProjectFormsPanel
              locale={formLocale}
              projectId={project.id}
              programFamily={project.program_family}
              forms={todoForms}
              people={questionnairePeople}
            />
          ),
          communication: (
            <>
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
            </>
          ),
          payments: (
            <ProjectPaymentsCard
              locale={locale}
              projectId={project.id}
              canCreate={canCreateRecords(membership?.role)}
              squareConnected={Boolean(squareConnection)}
              payments={projectPayments}
              people={questionnairePeople.map((p) => ({
                id: p.id,
                label: p.displayName,
              }))}
            />
          ),
        }}
      />
    </div>
  );
}
