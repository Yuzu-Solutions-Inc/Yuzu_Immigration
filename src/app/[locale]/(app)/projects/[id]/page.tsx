import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { ProjectDocumentsPanel } from "@/components/documents/project-documents-panel";
import { ProjectFormsPanel } from "@/components/forms/project-forms-panel";
import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import {
  ExportProjectFileButton,
  ProjectRetentionPanel,
} from "@/components/privacy/retention-export";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { ProjectAssistantShare } from "@/components/projects/project-assistant-share";
import { formatStatusDate } from "@/components/projects/project-status-summary";
import { ProjectStatusCard } from "@/components/projects/project-status-update-form";
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
import {
  answersForPersonFill,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import {
  getActiveShareLink,
  getProjectFormAnswers,
  listProjectForms,
} from "@/lib/ircc/project-forms";
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

  const questionnairePeople: QuestionnairePerson[] = participants
    .filter((row) => row.person)
    .map((row) => {
      const person = row.person!;
      const formCodes = forms
        .filter(
          (f) =>
            f.person_id === person.id ||
            (row.role === "principal" && !f.person_id),
        )
        .map((f) => f.form_code);
      const raw = answersForPersonFill(store, person.id);
      if (person.email) raw.email = person.email;
      return {
        id: person.id,
        displayName: `${person.first_name} ${person.last_name}`.trim(),
        role: row.role,
        formCodes,
        answers: withProjectFormLanguage(
          mergeAccountRepIntoAnswers(raw, repProfile),
          project.form_language,
        ),
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
            {tprog(project.program_family)}
            {project.jurisdiction !== "federal"
              ? ` · ${t(`jurisdictions.${project.jurisdiction}`)}`
              : ""}{" "}
            ·{" "}
            {t(`formLanguages.${project.form_language === "fr" ? "fr" : "en"}`)}
          </p>
          {project.description ? (
            <p className="max-w-2xl text-sm text-brand/80">
              {project.description}
            </p>
          ) : null}
          {project.notes ? (
            <p className="max-w-2xl text-sm text-muted-foreground" title={project.notes}>
              {t("notes")}: {project.notes}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-elevated sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:divide-x divide-y sm:divide-y-0 divide-border">
        <ProjectStatusCard
          locale={locale}
          projectId={project.id}
          currentStatus={project.status}
          currentStatusAt={project.status_at}
          history={history}
        />
        <div className="px-4 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("submitBefore")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand">
            {project.submit_before
              ? formatStatusDate(project.submit_before, locale)
              : t("submitBeforeEmpty")}
          </p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("opened")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand">
            {opened}
          </p>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("representative")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand">
            {project.representative?.full_name ||
              project.representative?.email ||
              t("representativeUnassigned")}
          </p>
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

      <div id="forms" className="scroll-mt-20">
        <ProjectFormsPanel
          locale={formLocale}
          projectId={project.id}
          programFamily={project.program_family}
          forms={forms}
          people={questionnairePeople}
          activeShareExpiresAt={share?.expires_at ?? null}
        />
      </div>
    </div>
  );
}
