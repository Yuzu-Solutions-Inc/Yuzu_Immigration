import { setRequestLocale } from "next-intl/server";

import { InvoicesPage } from "@/components/finance/screens/InvoicesPage";
import { loadInvoicesScreen } from "@/lib/finance/load-screens";
import { requireModule } from "@/lib/modules/require-module";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModule(locale, "finance");
  const initial = await loadInvoicesScreen();
  return <InvoicesPage initial={initial} />;
}
