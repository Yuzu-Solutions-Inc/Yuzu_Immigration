import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { AdjustmentsPage } from "@/components/finance/screens/AdjustmentsPage";
import { loadAdjustmentsScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <AdjustmentsLoader />
    </FinanceRouteGuard>
  );
}

async function AdjustmentsLoader() {
  const initial = await loadAdjustmentsScreen();
  return <AdjustmentsPage initial={initial} />;
}
