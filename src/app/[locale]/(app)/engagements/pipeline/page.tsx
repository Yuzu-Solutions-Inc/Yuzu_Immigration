import { setRequestLocale } from "next-intl/server";

import { PipelinePage } from "@/components/finance/screens/PipelinePage";
import { loadPipelineScreen } from "@/lib/finance/load-screens";
import { requireModule } from "@/lib/modules/require-module";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModule(locale, "finance");
  const initial = await loadPipelineScreen();
  return <PipelinePage initial={initial} />;
}
