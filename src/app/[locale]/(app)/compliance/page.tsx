import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { CompliancePage } from "@/components/finance/screens/CompliancePage";
import { loadComplianceScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <ComplianceLoader />
    </FinanceRouteGuard>
  );
}

async function ComplianceLoader() {
  const initial = await loadComplianceScreen();
  return <CompliancePage initial={initial} />;
}
