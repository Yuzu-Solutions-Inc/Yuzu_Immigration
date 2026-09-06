import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { ExecutiveDashboardPage } from "@/components/finance/screens/ExecutiveDashboardPage";
import { HomeDashboardSwitch } from "@/components/home/home-dashboard-switch";
import { HomeDashboardView } from "@/components/home/home-dashboard";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { getHomeDashboard, EMPTY_HOME_DASHBOARD } from "@/lib/crm/dashboard";
import { loadExecutiveDashboard } from "@/lib/finance/load-executive-dashboard";
import { isModuleEnabled } from "@/lib/modules/org-modules";

export default async function AppHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale } = await params;
  const { view } = await searchParams;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const financeOn = Boolean(
    membership && isModuleEnabled(membership.enabledModules, "finance"),
  );
  const immigrationOn = Boolean(
    membership && isModuleEnabled(membership.enabledModules, "immigration"),
  );
  const requested =
    view === "immigration" || view === "finance" ? view : null;
  const active: "finance" | "immigration" | null = requested
    ? requested === "immigration"
      ? immigrationOn
        ? "immigration"
        : financeOn
          ? "finance"
          : null
      : financeOn
        ? "finance"
        : immigrationOn
          ? "immigration"
          : null
    : financeOn
      ? "finance"
      : immigrationOn
        ? "immigration"
        : null;

  const switcher =
    financeOn && immigrationOn && active ? (
      <HomeDashboardSwitch active={active} />
    ) : null;

  if (active === "finance") {
    const snapshot = await loadExecutiveDashboard();
    return (
      <FinanceRouteGuard locale={locale}>
        {switcher}
        <ExecutiveDashboardPage initialSnapshot={snapshot} />
      </FinanceRouteGuard>
    );
  }

  const [user, dashboard] = await Promise.all([
    getSessionUser(),
    immigrationOn ? getHomeDashboard(locale) : Promise.resolve(null),
  ]);
  const canCreate = canCreateInWorkspace(membership);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  return (
    <>
      {switcher}
      <HomeDashboardView
        locale={locale}
        displayName={displayName}
        canCreate={canCreate && immigrationOn}
        dashboard={dashboard ?? EMPTY_HOME_DASHBOARD}
      />
    </>
  );
}
