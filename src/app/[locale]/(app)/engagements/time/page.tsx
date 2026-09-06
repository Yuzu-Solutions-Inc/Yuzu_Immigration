import { setRequestLocale } from "next-intl/server";

import { TimePage } from "@/components/finance/screens/TimePage";
import { loadTimeScreen } from "@/lib/finance/load-screens";
import { requireModule } from "@/lib/modules/require-module";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModule(locale, "finance");
  const initial = await loadTimeScreen();
  return <TimePage initial={initial} />;
}
