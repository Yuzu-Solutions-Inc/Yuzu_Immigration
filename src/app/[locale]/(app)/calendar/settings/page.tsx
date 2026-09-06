import { redirect } from "next/navigation";

export default async function LegacyCalendarSettingsRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ google?: string; microsoft?: string; zoom?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();
  if (query.google) qs.set("google", query.google);
  if (query.microsoft) qs.set("microsoft", query.microsoft);
  if (query.zoom) qs.set("zoom", query.zoom);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/${locale}/settings/account${suffix}`);
}
