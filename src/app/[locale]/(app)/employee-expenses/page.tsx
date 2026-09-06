import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";

import { EmployeeExpensesPage } from "@/components/finance/screens/EmployeeExpensesPage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <EmployeeExpensesPage />
    </FinanceRouteGuard>
  );
}
