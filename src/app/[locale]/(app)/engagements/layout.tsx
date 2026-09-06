import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { BillingPage } from "@/components/finance/screens/BillingPage";
import { loadBillingMetrics } from "@/lib/finance/load-screens";

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
      <BillingLayoutBody>{children}</BillingLayoutBody>
    </FinanceRouteGuard>
  );
}

async function BillingLayoutBody({ children }: { children: React.ReactNode }) {
  const metrics = await loadBillingMetrics();
  return <BillingPage initialMetrics={metrics}>{children}</BillingPage>;
}
