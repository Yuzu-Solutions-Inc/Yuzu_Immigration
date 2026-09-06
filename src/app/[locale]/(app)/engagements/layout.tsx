import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { BillingPage } from "@/components/finance/screens/BillingPage";

export default async function EngagementsLayout({
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
      <BillingPage>{children}</BillingPage>
    </FinanceRouteGuard>
  );
}
