import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { TeamSettings } from "@/components/settings/team-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { listOrgMembers, listPendingInvitations } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
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

  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug")
    .eq("id", membership.organization.id)
    .maybeSingle();

  if (!org) redirect(`/${locale}/onboarding`);

  const [members, invitations] = await Promise.all([
    listOrgMembers(),
    listPendingInvitations(),
  ]);

  const t = await getTranslations("settings");

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("organization")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("organizationHelp")}</p>
      </div>
      <OrganizationSettingsForm
        locale={locale}
        initialValues={{
          name: org.name ?? "",
          slug: org.slug ?? "",
        }}
      />
      <TeamSettings
        locale={locale}
        currentUserId={user?.id ?? ""}
        members={members}
        invitations={invitations}
      />
    </SurfaceCard>
  );
}
