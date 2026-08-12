import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/app-shell";
import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { canCreateRecords } from "@/lib/auth/rbac";
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

  await acceptPendingInvitationsForUser();

  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <DashboardShell
      locale={locale}
      orgName={membership.organization.name}
      canCreate={canCreateRecords(membership.role)}
    >
      {children}
    </DashboardShell>
  );
}
