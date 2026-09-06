import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { EmployeeExpensesPage } from "@/components/finance/screens/EmployeeExpensesPage";
import { loadEmployeeExpensesScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <EmployeeExpensesLoader />
    </FinanceRouteGuard>
  );
}

async function EmployeeExpensesLoader() {
  const initial = await loadEmployeeExpensesScreen();
  return <EmployeeExpensesPage initial={initial} />;
}
