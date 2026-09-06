import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { CorporateTaxPage } from "@/components/finance/screens/CorporateTaxPage";
import { loadCorporateTaxScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <CorporateTaxLoader />
    </FinanceRouteGuard>
  );
}

async function CorporateTaxLoader() {
  const initial = await loadCorporateTaxScreen();
  return <CorporateTaxPage initial={initial} />;
}
