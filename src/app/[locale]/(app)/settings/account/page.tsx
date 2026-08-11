import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { AccountSettingsForm } from "@/components/settings/account-settings-form";
import { SurfaceCard } from "@/components/layout/surface-card";
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
    .select("full_name, email, preferred_locale")
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
        preferredLocale={toAppLocale(profile?.preferred_locale)}
      />
    </SurfaceCard>
  );
}
