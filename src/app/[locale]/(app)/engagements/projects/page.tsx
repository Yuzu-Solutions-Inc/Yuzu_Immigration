import { setRequestLocale } from "next-intl/server";

import { ProjectsPage } from "@/components/finance/screens/ProjectsPage";
import { loadEngagementsScreen } from "@/lib/finance/load-screens";
import { requireModule } from "@/lib/modules/require-module";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireModule(locale, "finance");
  const initial = await loadEngagementsScreen();
  return <ProjectsPage initial={initial} />;
}
