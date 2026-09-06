import { setRequestLocale } from "next-intl/server";

import { InvoicesPage } from "@/components/finance/screens/InvoicesPage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InvoicesPage />;
}
