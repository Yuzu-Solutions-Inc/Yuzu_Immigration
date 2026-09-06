import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { GeneralLedgerPage } from "@/components/finance/screens/GeneralLedgerPage";
import { loadGeneralLedgerScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <GeneralLedgerLoader />
    </FinanceRouteGuard>
  );
}

async function GeneralLedgerLoader() {
  const initial = await loadGeneralLedgerScreen();
  return <GeneralLedgerPage initial={initial} />;
}
