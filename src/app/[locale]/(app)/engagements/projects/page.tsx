import { setRequestLocale } from "next-intl/server";

import { ProjectsPage } from "@/components/finance/screens/ProjectsPage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProjectsPage />;
}
