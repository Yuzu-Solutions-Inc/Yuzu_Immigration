import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { BankPage } from "@/components/finance/screens/BankPage";
import { loadBankScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <BankPageLoader />
    </FinanceRouteGuard>
  );
}

async function BankPageLoader() {
  const initial = await loadBankScreen();
  return <BankPage initial={initial} />;
}
