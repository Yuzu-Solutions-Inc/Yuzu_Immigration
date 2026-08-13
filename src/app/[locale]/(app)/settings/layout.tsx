import { getTranslations, setRequestLocale } from "next-intl/server";

import { SettingsTabs } from "@/components/settings/settings-tabs";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const membership = await getPrimaryMembership();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SettingsTabs canAdminister={canAdministerOrg(membership?.role)} />
      {children}
    </div>
  );
}
