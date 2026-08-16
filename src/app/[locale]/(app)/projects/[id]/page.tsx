import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export const maxDuration = 60;

import { listProjectPaymentLinks } from "@/app/actions/project-payment";
import { getOrgSquareConnection } from "@/lib/square/client";
import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectDocumentsPanel } from "@/components/documents/project-documents-panel";
import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import { ProjectPortalCard } from "@/components/projects/project-portal-card";
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
import { isChildParticipantRole } from "@/lib/crm/programs";
import {
  listProjectCallInvites,
  listProjectMeetingHistory,
} from "@/lib/booking/queries";
import { getAppBaseUrl } from "@/lib/app-url";
import { toAppLocale } from "@/lib/i18n/locales";
import { portalBaseUrl } from "@/lib/portal/auth";
import { ensureProjectDocumentsSeeded } from "@/lib/documents/service";
import { listProjectDocumentRequests } from "@/lib/documents/service";
import { normalizeAnswersStore } from "@/lib/ircc/answers-store";
import { isFormMandatoryComplete } from "@/lib/ircc/form-readiness";
import { PROFILE_REP_SELECT } from "@/lib/ircc/account-rep";
import {
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
  const canCreate = canCreateRecords(membership?.role);

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
    documentRequests,
    members,
    assistantIds,
    notes,
    meetings,
    callInvites,
    bookingSettings,
    projectPayments,
    squareConnection,
    appBaseUrl,
  ] = await Promise.all([
    getProjectParticipants(id),
    getProjectStatusHistory(id),
    listProjectForms(id),
    getProjectFormAnswers(id),
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
    getAppBaseUrl(),
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

  const programLabel =
    project.organization_program_name || tprog(project.program_family);
  const representativeLabel =
    project.representative?.full_name ||
    project.representative?.email ||
    t("representativeUnassigned");
  const modificationBlocked = project.status === "granted";
  const portalInvitees = participants.filter(
    (row) =>
      !isChildParticipantRole(row.role) && Boolean(row.person?.email?.trim()),
  );
  const portalInviteeNames = portalInvitees
    .map((row) => {
      const person = row.person;
      const name = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim();
      return name || person?.email?.trim() || "";
    })
    .filter(Boolean);
  const portalHasEmail = portalInviteeNames.length > 0;

  const languageLabel = t(
    `formLanguages.${project.form_language === "fr" ? "fr" : "en"}`,
  );
  const metaParts = [
    programLabel,
    languageLabel,
    project.jurisdiction !== "federal"
      ? t(`jurisdictions.${project.jurisdiction}`)
      : null,
    `${t("opened")} ${opened}`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <header className="space-y-4 pb-5">
        <Link
          href="/projects"
          className="inline-flex text-sm font-medium text-action hover:underline"
        >
          ← {t("back")}
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand sm:text-3xl">
                {project.title}
              </h1>
              <ProjectStatusCard
                locale={locale}
                projectId={project.id}
                currentStatus={project.status}
                currentStatusAt={project.status_at}
                history={history}
              />
            </div>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {metaParts.map((part, index) => (
                <span key={part} className="inline-flex items-center gap-x-2">
                  {index > 0 ? <span aria-hidden>·</span> : null}
                  <span
                    className={
                      index === 0 ? "font-medium text-brand/85" : undefined
                    }
                  >
                    {part}
                  </span>
                </span>
              ))}
            </p>

            {project.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-brand/75">
                {project.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
            <p className="text-sm text-muted-foreground">
              {t("representative")} · {representativeLabel}
            </p>
            <ProjectSubmitBeforeCard
              locale={locale}
              projectId={project.id}
              currentSubmitBefore={project.submit_before}
            />
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
      </header>

      <section className="border-t border-border pt-6">
        <ProjectDetailTabs
        panels={{
          home: (
            <ProjectHomeTab
              docsDone={docsDone}
              docsTotal={docsTotal}
              formPercent={formPercent}
              clientLink={
                canCreate ? (
                  <ProjectPortalCard
                    locale={locale}
                    projectId={project.id}
                    portalBaseUrl={portalBaseUrl(
                      appBaseUrl,
                      toAppLocale(project.form_language),
                    )}
                    inviteeNames={portalInviteeNames}
                    hasAnyInviteeEmail={portalHasEmail}
                  />
                ) : null
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
              modificationBlocked={modificationBlocked}
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
              modificationBlocked={modificationBlocked}
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
      </section>
    </div>
  );
}
