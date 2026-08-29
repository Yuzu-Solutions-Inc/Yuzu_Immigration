import { getTranslations, setRequestLocale } from "next-intl/server";

import { NewProjectButton } from "@/components/layout/app-shell";
import { SurfaceCard } from "@/components/layout/surface-card";
import {
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from "@/components/layout/list-layout";
import { ProjectsCatalogButtons } from "@/components/projects/projects-catalog-buttons";
import { ProjectsTable } from "@/components/projects/projects-table";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPrimaryMembership } from "@/lib/auth/session";
import { canManageBookingCatalog } from "@/lib/auth/rbac";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { listBookingForms, listBookingServices, listServiceFormFields } from "@/lib/booking/queries";
import { listContractTemplates, loadStaffContractSignature } from "@/lib/contracts/queries";
import { listOrgMembers, listProjectsPage } from "@/lib/crm/queries";
import { cn } from "@/lib/utils";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ contracts?: string }>;
}) {
  const { locale } = await params;
  const { contracts } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("projects");
  const th = await getTranslations("appHome");
  const to = await getTranslations("orgPrograms");
  const tf = await getTranslations("customForms");
  const membership = await getPrimaryMembership();
  const canCreate = canCreateInWorkspace(membership);
  const appLocale = toAppLocale(locale);
  const [projects, members, services, forms, formFields, templates, signature] =
    await Promise.all([
      listProjectsPage(),
      listOrgMembers(),
      listBookingServices(),
      listBookingForms(),
      listServiceFormFields(),
      listContractTemplates(),
      loadStaffContractSignature(),
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
          <ProjectsCatalogButtons
            locale={locale}
            orgDefaultLocale={membership?.organization.defaultLocale ?? appLocale}
            canManage={canManageBookingCatalog(membership?.role)}
            services={services}
            forms={forms}
            formFields={formFields}
            templates={templates}
            signature={signature}
            openContracts={contracts === "1"}
          />
          <Link
            href="/projects/templates"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {to("manageButton")}
          </Link>
          <Link
            href="/projects/forms"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {tf("manageButton")}
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
