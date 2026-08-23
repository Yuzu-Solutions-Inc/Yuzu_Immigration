import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { ProjectsTable } from "@/components/projects/projects-table";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listOrgMembers, listProjectsPage } from "@/lib/crm/queries";
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
  const [projects, members] = await Promise.all([
    listProjectsPage(),
    listOrgMembers(),
  ]);

  return (
    <div className={listPageClassName}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className={listPageHeaderClassName}>
          <h1 className={listPageTitleClassName}>
            {t("title")}
          </h1>
          <p className={listPageSubtitleClassName}>{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/projects/templates"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {to("manageButton")}
          </Link>
          {canCreate ? <NewProjectButton label={t("new")} /> : null}
        </div>
      </div>

      {projects.total === 0 ? (
        <SurfaceCard className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
          {canCreate ? <NewProjectButton label={th("newProject")} /> : null}
        </SurfaceCard>
      ) : (
        <ProjectsTable
          initial={projects}
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
