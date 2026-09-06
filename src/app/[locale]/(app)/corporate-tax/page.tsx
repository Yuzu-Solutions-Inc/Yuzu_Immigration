import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";

import { CorporateTaxPage } from "@/components/finance/screens/CorporateTaxPage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <CorporateTaxPage />
    </FinanceRouteGuard>
  );
}
