import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { listProjects } from "@/lib/crm/queries";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("projects");
  const tprog = await getTranslations("programs");
  const th = await getTranslations("appHome");
  const projects = await listProjects();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NewProjectButton label={t("new")} />
      </div>

      {projects.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          <NewProjectButton label={th("newProject")} />
        </SurfaceCard>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-brand">{project.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {tprog(project.program_family)} ·{" "}
                    {t(`jurisdictions.${project.jurisdiction}`)}
                  </p>
                </div>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`statuses.${project.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
