import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { PayrollPage } from "@/components/finance/screens/PayrollPage";
import { loadPayrollScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <PayrollLoader />
    </FinanceRouteGuard>
  );
}

async function PayrollLoader() {
  const initial = await loadPayrollScreen();
  return <PayrollPage initial={initial} />;
}
