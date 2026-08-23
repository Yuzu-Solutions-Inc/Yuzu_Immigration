import { setRequestLocale } from "next-intl/server";

import { HomeDashboardView } from "@/components/home/home-dashboard";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getHomeDashboard } from "@/lib/crm/dashboard";

export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [user, membership, dashboard] = await Promise.all([
    getSessionUser(),
    getPrimaryMembership(),
    getHomeDashboard(locale),
  ]);
  const canCreate = canCreateInWorkspace(membership);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <HomeDashboardView
      locale={locale}
      displayName={displayName}
      canCreate={canCreate}
      dashboard={dashboard}
    />
  );
}
