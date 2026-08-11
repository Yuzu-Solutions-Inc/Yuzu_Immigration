import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { formatStatusDate } from "@/components/projects/project-status-summary";
import { ProjectStatusCard } from "@/components/projects/project-status-update-form";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  getProject,
  getProjectParticipants,
  getProjectStatusHistory,
} from "@/lib/crm/queries";
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

  const [participants, history] = await Promise.all([
    getProjectParticipants(id),
    getProjectStatusHistory(id),
  ]);
  const t = await getTranslations("projects");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");

  const opened = new Date(project.opened_at).toLocaleDateString(
    locale === "fr" ? "fr-CA" : "en-CA",
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

      <div className="grid gap-4 sm:grid-cols-3">
        <ProjectStatusCard
          locale={locale === "fr" ? "fr" : "en"}
          projectId={project.id}
          currentStatus={project.status}
          currentStatusAt={project.status_at}
        />
        <SurfaceCard className="space-y-1 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("submitBefore")}
          </p>
          <p className="font-medium text-brand">
            {project.submit_before
              ? formatStatusDate(project.submit_before, locale)
              : t("submitBeforeEmpty")}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-1 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("opened")}
          </p>
          <p className="font-medium text-brand">{opened}</p>
        </SurfaceCard>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("statusHistoryTitle")}
        </h2>
        {history.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">
              {t("statusHistoryEmpty")}
            </p>
          </SurfaceCard>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <p className="font-medium text-brand">
                  {t(`statuses.${entry.status}`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatStatusDate(entry.status_at, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
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
