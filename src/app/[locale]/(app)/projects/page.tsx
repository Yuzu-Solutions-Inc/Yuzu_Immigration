import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import { ProjectsTable } from "@/components/projects/projects-table";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { getProjectsProgress } from "@/lib/crm/progress";
import { listOrgMembers, listProjects } from "@/lib/crm/queries";
import { cn } from "@/lib/utils";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("projects");
  const th = await getTranslations("appHome");
  const to = await getTranslations("orgPrograms");
  const membership = await getPrimaryMembership();
  const canCreate = canCreateRecords(membership?.role);
  const projectsPromise = listProjects();
  const membersPromise = listOrgMembers();
  const projects = await projectsPromise;
  const [members, progressMap] = await Promise.all([
    membersPromise,
    getProjectsProgress(projects.map((project) => project.id)),
  ]);
  const progressById = Object.fromEntries(progressMap);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/projects/templates"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {to("manageButton")}
          </Link>
          {canCreate ? <NewProjectButton label={t("new")} /> : null}
        </div>
      </div>

      {projects.length === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          {canCreate ? <NewProjectButton label={th("newProject")} /> : null}
        </SurfaceCard>
      ) : (
        <ProjectsTable
          projects={projects}
          progressById={progressById}
          members={members.map((m) => ({
            user_id: m.user_id,
            full_name: m.profile.full_name,
            email: m.profile.email,
          }))}
        />
      )}
    </div>
  );
}
