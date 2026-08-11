import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/app-shell";
import {
  getPrimaryMembership,
  getSessionUser,
} from "@/lib/auth/session";

export default async function AppDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <DashboardShell locale={locale} orgName={membership.organization.name}>
      {children}
    </DashboardShell>
  );
}
