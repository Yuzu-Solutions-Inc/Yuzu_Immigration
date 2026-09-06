import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";

import { CompensationPage } from "@/components/finance/screens/CompensationPage";

export default async function CompensationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <CompensationPage>{children}</CompensationPage>
    </FinanceRouteGuard>
  );
}
