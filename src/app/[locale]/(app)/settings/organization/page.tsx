import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { OrganizationDpaPanel } from "@/components/settings/organization-dpa-panel";
import { OrganizationSettingsForm } from "@/components/settings/organization-settings-form";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
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

  return (
    <div className="space-y-4">
      <SurfaceCard className="space-y-5 sm:p-6">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("organization")}
        </h2>
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
      <SurfaceCard className="sm:p-6">
        <OrganizationDpaPanel
          locale={locale}
          acceptedAt={org.dpa_accepted_at ?? null}
          acceptedVersion={org.dpa_version ?? null}
        />
      </SurfaceCard>
    </div>
  );
}
