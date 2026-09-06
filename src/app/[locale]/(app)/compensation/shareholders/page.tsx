import { setRequestLocale } from "next-intl/server";

import { FinanceRouteGuard } from "@/components/finance/finance-route-guard";
import { ShareholdersPage } from "@/components/finance/screens/ShareholdersPage";
import { loadShareholdersScreen } from "@/lib/finance/load-screens";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <FinanceRouteGuard locale={locale}>
      <ShareholdersLoader />
    </FinanceRouteGuard>
  );
}

async function ShareholdersLoader() {
  const initial = await loadShareholdersScreen();
  return <ShareholdersPage initial={initial} />;
}
