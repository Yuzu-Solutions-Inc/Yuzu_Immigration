import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { EmployeesPage } from "@/components/finance/screens/EmployeesPage";
import { loadEmployeesScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <EmployeesLoader />
    </FinanceRouteGuard>
  );
}

async function EmployeesLoader() {
  const initial = await loadEmployeesScreen();
  return <EmployeesPage initial={initial} />;
}
