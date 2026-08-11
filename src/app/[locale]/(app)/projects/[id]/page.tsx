import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ensureProjectFormsSeeded } from "@/app/actions/forms";
import { formatStatusDate } from "@/components/projects/project-status-summary";
import { ProjectStatusCard } from "@/components/projects/project-status-update-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  getProject,
  getProjectParticipants,
  getProjectStatusHistory,
} from "@/lib/crm/queries";
import { formTitle, type FormCode } from "@/lib/ircc/catalog";
import {
  getActiveShareLink,
  listProjectForms,
} from "@/lib/ircc/project-forms";
import { cn } from "@/lib/utils";

export default async function ProjectDetailPage({
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

  const [participants, history, forms, share] = await Promise.all([
    getProjectParticipants(id),
    getProjectStatusHistory(id),
    listProjectForms(id),
    getActiveShareLink(id),
  ]);
  const t = await getTranslations("projects");
  const tf = await getTranslations("forms");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");
  const loc = locale === "fr" ? "fr" : locale === "es" ? "es" : "en";

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
            {tprog(project.program_family)} ·{" "}
            {t(`jurisdictions.${project.jurisdiction}`)}
          </p>
          {project.description ? (
            <p className="max-w-2xl text-sm text-brand/80">
              {project.description}
            </p>
          ) : null}
        </div>
        <Link
          href={`/projects/${project.id}/edit`}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-action text-white hover:bg-action/90",
          )}
        >
          {t("edit")}
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <ProjectStatusCard
          locale={locale}
          projectId={project.id}
          currentStatus={project.status}
          currentStatusAt={project.status_at}
          history={history}
        />
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("submitBefore")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand">
            {project.submit_before
              ? formatStatusDate(project.submit_before, locale)
              : t("submitBeforeEmpty")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("opened")}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand">
            {opened}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated sm:col-span-1">
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
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {tf("todoTitle")}
          </h2>
          <Link
            href={`/projects/${project.id}/forms`}
            className="text-sm font-medium text-action hover:underline"
          >
            {tf("manageForms")}
          </Link>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {forms.length === 0 ? (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              {tf("todoEmpty")}
            </li>
          ) : (
            forms.map((form) => (
              <li
                key={form.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-brand">
                    {formTitle(form.form_code as FormCode, loc)}
                  </p>
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">
                    {form.form_code.toUpperCase()}
                  </p>
                </div>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {tf(`statuses.${form.status}`)}
                </span>
              </li>
            ))
          )}
        </ul>
        {share ? (
          <p className="text-sm text-muted-foreground">
            {tf("shareActive", {
              date: formatStatusDate(share.expires_at.slice(0, 10), locale),
            })}
          </p>
        ) : null}
      </section>

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
    </div>
  );
}
