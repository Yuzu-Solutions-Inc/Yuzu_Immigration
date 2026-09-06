import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { SalesTaxPage } from "@/components/finance/screens/SalesTaxPage";
import { loadSalesTaxScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <SalesTaxLoader />
    </FinanceRouteGuard>
  );
}

async function SalesTaxLoader() {
  const initial = await loadSalesTaxScreen();
  return <SalesTaxPage initial={initial} />;
}
