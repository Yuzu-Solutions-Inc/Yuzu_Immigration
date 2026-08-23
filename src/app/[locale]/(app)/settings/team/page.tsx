import { redirect } from "next/navigation";

export default async function LegacyTeamSettingsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/settings/billing`);
}
