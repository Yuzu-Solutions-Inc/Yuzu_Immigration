import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { SettingsPage } from "@/components/finance/screens/SettingsPage";
import { SurfaceCard } from "@/components/layout/surface-card";
import { DeleteOrganizationPanel } from "@/components/settings/delete-organization-panel";
import { OrganizationDpaPanel } from "@/components/settings/organization-dpa-panel";
import { OrganizationModulesForm } from "@/components/settings/organization-modules-form";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { WorkspaceSettingsSections } from "@/components/settings/workspace-settings-sections";
import { canAdministerOrg, canDeleteOrganization, isOwner } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listOrgMembers } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canAdministerOrg(membership.role)) {
    redirect(`/${locale}/settings/account`);
  }

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "name, slug, default_locale, privacy_contact_email, portal_google_login_enabled, dpa_accepted_at, dpa_version",
    )
    .eq("id", membership.organization.id)
    .maybeSingle();

  if (!org) redirect(`/${locale}/onboarding`);

  const t = await getTranslations("settings");
  const tm = await getTranslations("modules");
  const members = await listOrgMembers();
  const owner = members.find((member) => isOwner(member.role));
  const ownerName =
    owner?.profile.full_name?.trim() || owner?.profile.email || t("ownerContactUnknown");
  const financeOn = isModuleEnabled(membership.enabledModules, "finance");

  return (
    <WorkspaceSettingsSections
      firm={
        <SurfaceCard className="space-y-5 sm:p-6">
          <p className="text-sm text-muted-foreground">{t("organizationHelp")}</p>
          <div className="rounded-xl border border-border bg-canvas px-4 py-3">
            <p className="text-sm font-medium text-brand">{t("ownerContactTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("ownerContactHelp")}</p>
            <p className="mt-2 text-sm text-brand">
              {ownerName}
              {owner?.profile.email && owner?.profile.full_name ? (
                <>
                  {" · "}
                  <a
                    href={`mailto:${owner.profile.email}`}
                    className="font-medium text-action underline-offset-2 hover:underline"
                  >
                    {owner.profile.email}
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <OrganizationSettingsForm
            locale={locale}
            initialValues={{
              name: org.name ?? "",
              slug: org.slug ?? "",
              defaultLocale: toAppLocale(org.default_locale),
              privacyContactEmail: org.privacy_contact_email ?? "",
              portalGoogleLoginEnabled: org.portal_google_login_enabled === true,
            }}
          />
        </SurfaceCard>
      }
      modules={
        <SurfaceCard className="space-y-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold text-brand">
              {tm("title")}
            </h2>
            <p className="text-sm text-muted-foreground">{tm("subtitle")}</p>
          </div>
          <OrganizationModulesForm initialEnabled={membership.enabledModules} />
        </SurfaceCard>
      }
      company={
        financeOn ? (
          <FinanceRouteGuard locale={localeParam}>
            <SurfaceCard className="space-y-5 sm:p-6">
              <SettingsPage />
            </SurfaceCard>
          </FinanceRouteGuard>
        ) : undefined
      }
      legal={
        <>
          <SurfaceCard className="sm:p-6">
            <OrganizationDpaPanel
              locale={locale}
              acceptedAt={org.dpa_accepted_at ?? null}
              acceptedVersion={org.dpa_version ?? null}
            />
          </SurfaceCard>
          {canDeleteOrganization(membership.role) ? (
            <SurfaceCard className="sm:p-6">
              <DeleteOrganizationPanel
                locale={locale}
                organizationName={org.name ?? ""}
              />
            </SurfaceCard>
          ) : (
            <SurfaceCard className="sm:p-6">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("deleteOrgTitle")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("deleteOrgOwnerOnly")}
              </p>
            </SurfaceCard>
          )}
        </>
      }
    />
  );
}
