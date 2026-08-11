import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { listPeople, listProjects } from "@/lib/crm/queries";

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  const t = await getTranslations("appHome");
  const tp = await getTranslations("projects");
  const tprog = await getTranslations("programs");

  const [projects, people] = await Promise.all([listProjects(), listPeople()]);
  const recent = projects.slice(0, 5);
  const activeCount = projects.filter((p) => p.status === "active").length;
  const onHoldCount = projects.filter((p) => p.status === "on_hold").length;

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand sm:text-3xl">
            {displayName
              ? t("welcome", { name: displayName })
              : t("welcomeFallback")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("dashboardSubtitle")}</p>
        </div>
        <NewProjectButton label={t("newProject")} />
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.activeProjects")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {activeCount}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.people")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {people.length}
          </p>
        </SurfaceCard>
        <SurfaceCard className="space-y-1 sm:p-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("stats.onHold")}
          </p>
          <p className="font-heading text-3xl font-semibold text-brand">
            {onHoldCount}
          </p>
        </SurfaceCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("recentProjects")}
            </h2>
            <Link
              href="/projects"
              className="text-sm font-medium text-action hover:underline"
            >
              {t("viewAllProjects")}
            </Link>
          </div>

          {recent.length === 0 ? (
            <SurfaceCard className="space-y-3">
              <p className="text-[15px] text-muted-foreground">
                {t("emptyProjects")}
              </p>
              <NewProjectButton label={t("newProject")} />
            </SurfaceCard>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
              {recent.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-brand">{project.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {tprog(project.program_family)} ·{" "}
                        {tp(`jurisdictions.${project.jurisdiction}`)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {tp(`statuses.${project.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          <SurfaceCard className="space-y-2 sm:p-5">
            <h2 className="font-heading text-base font-semibold text-brand">
              {t("placeholders.deadlinesTitle")}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              {t("placeholders.deadlinesBody")}
            </p>
          </SurfaceCard>
          <SurfaceCard className="space-y-2 sm:p-5">
            <h2 className="font-heading text-base font-semibold text-brand">
              {t("placeholders.activityTitle")}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              {t("placeholders.activityBody")}
            </p>
          </SurfaceCard>
        </div>
      </section>
    </div>
  );
}
