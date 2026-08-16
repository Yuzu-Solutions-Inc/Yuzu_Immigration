import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { PortalLoginGate } from "@/components/portal/portal-login-gate";
import { getPortalSession } from "@/lib/portal/auth";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getPortalSession();
  if (session) {
    redirect({ href: "/portal/home", locale });
  }

  return (
    <PortalLoginGate locale={locale} mode="needs_password_login" />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  return { title: t("title") };
}
