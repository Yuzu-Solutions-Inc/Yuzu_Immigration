import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/app-shell";
import { acceptPendingInvitationsForUser } from "@/lib/auth/invitations";
import { getSessionUser, getWorkspaceContext } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { hasAcceptedLegal } from "@/lib/legal/acceptance";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

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

  const { membership, memberships } = await getWorkspaceContext();
  if (!hasAcceptedLegal(user) && !membership) {
    redirect(`/${locale}/legal/accept?next=${encodeURIComponent(`/${locale}/home`)}`);
  }
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <DashboardShell
      locale={locale}
      organizations={memberships.map((row) => ({
        id: row.organization.id,
        name: row.organization.name,
        role: row.role,
      }))}
      activeOrganizationId={membership.organization.id}
      canCreate={canCreateInWorkspace(membership)}
      writable={membership.organization.writable}
      role={membership.role}
      enabledModules={membership.enabledModules}
    >
      {children}
    </DashboardShell>
  );
}
