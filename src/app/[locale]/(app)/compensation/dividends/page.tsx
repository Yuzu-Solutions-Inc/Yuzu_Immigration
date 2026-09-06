import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { DividendsPage } from "@/components/finance/screens/DividendsPage";
import { loadDividendsScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <DividendsLoader />
    </FinanceRouteGuard>
  );
}

async function DividendsLoader() {
  const initial = await loadDividendsScreen();
  return <DividendsPage initial={initial} />;
}
