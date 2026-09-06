import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { CompensationPage } from "@/components/finance/screens/CompensationPage";
import { loadCompensationMetrics } from "@/lib/finance/load-screens";

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
      <CompensationLayoutBody>{children}</CompensationLayoutBody>
    </FinanceRouteGuard>
  );
}

async function CompensationLayoutBody({ children }: { children: React.ReactNode }) {
  const metrics = await loadCompensationMetrics();
  return <CompensationPage initialMetrics={metrics}>{children}</CompensationPage>;
}
