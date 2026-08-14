import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { SquareSettings } from "@/components/settings/square-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { listOrgMembers, listPendingInvitations } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { squareConfigured } from "@/lib/square/oauth";
import { createClient } from "@/lib/supabase/server";

export default async function OrganizationSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ square?: string }>;
}) {
  const { locale: localeParam } = await params;
  const query = await searchParams;
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
    .select("name, slug, default_locale")
    .eq("id", membership.organization.id)
    .maybeSingle();

  if (!org) redirect(`/${locale}/onboarding`);

  const [members, invitations, squareRes] = await Promise.all([
    listOrgMembers(),
    listPendingInvitations(),
    supabase
      .from("square_connections")
      .select("business_name, merchant_id, currency, is_enabled")
      .eq("organization_id", membership.organization.id)
      .maybeSingle(),
  ]);

  const t = await getTranslations("settings");
  const squareFlash = query.square;

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("organization")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("organizationHelp")}</p>
      </div>
      {squareFlash === "connected" ? (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
          {t("squareConnectedFlash")}
        </p>
      ) : null}
      {squareFlash && squareFlash !== "connected" ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`squareErrors.${squareFlash}`, {
            defaultValue: t("squareErrors.save_failed"),
          })}
        </p>
      ) : null}
      <OrganizationSettingsForm
        locale={locale}
        initialValues={{
          name: org.name ?? "",
          slug: org.slug ?? "",
          defaultLocale: toAppLocale(org.default_locale),
        }}
      />
      <SquareSettings
        locale={locale}
        configured={squareConfigured()}
        connection={squareRes.data}
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
