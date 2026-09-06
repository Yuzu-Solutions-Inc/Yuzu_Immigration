import { setRequestLocale } from "next-intl/server";

import { TimePage } from "@/components/finance/screens/TimePage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TimePage />;
}
