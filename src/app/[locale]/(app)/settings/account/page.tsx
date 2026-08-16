import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { SurfaceCard } from "@/components/layout/surface-card";
import { hasEmailPasswordAuth } from "@/lib/auth/providers";
import { getSessionUser } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, email, rep_family_name, rep_given_name, rep_organization, rep_email, rep_phone, rep_phone_country_code, rep_membership_id, rep_street_num, rep_street_name, rep_city, rep_province, rep_country, rep_postal_code",
    )
    .eq("id", user.id)
    .maybeSingle();

  const t = await getTranslations("settings");

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("account")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("accountHelp")}</p>
      </div>
      <AccountSettingsForm
        locale={locale}
        email={profile?.email || user.email || ""}
        fullName={profile?.full_name || ""}
        canChangePassword={hasEmailPasswordAuth(user)}
        representative={{
          repFamilyName: profile?.rep_family_name ?? "",
          repGivenName: profile?.rep_given_name ?? "",
          repOrganization: profile?.rep_organization ?? "",
          repEmail: profile?.rep_email ?? "",
          repPhone: profile?.rep_phone ?? "",
          repPhoneCountryCode: profile?.rep_phone_country_code ?? "",
          repMembershipId: profile?.rep_membership_id ?? "",
          repStreetNum: profile?.rep_street_num ?? "",
          repStreetName: profile?.rep_street_name ?? "",
          repCity: profile?.rep_city ?? "",
          repProvince: profile?.rep_province ?? "",
          repCountry: profile?.rep_country ?? "Canada",
          repPostalCode: profile?.rep_postal_code ?? "",
        }}
      />
    </SurfaceCard>
  );
}
