import { redirect } from "next/navigation";

export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/settings/account`);
}
