import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { PortalSecurityPanel } from "@/components/portal/portal-security-panel";
import { getPortalSession } from "@/lib/portal/auth";
import { toAppLocale } from "@/lib/i18n/locales";

export default async function PortalSecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getPortalSession();
  if (!session) {
    redirect({ href: "/portal", locale });
    return null;
  }

  const t = await getTranslations("portal.security");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("lede")}</p>
      </header>
      <PortalSecurityPanel locale={toAppLocale(locale)} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal.security" });
  return { title: t("title") };
}
