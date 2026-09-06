import { SettingsAliasRedirect } from "@/components/settings/settings-alias-redirect";

export default async function LegacyCalendarSettingsRoute({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ google?: string; microsoft?: string; zoom?: string }>;
}) {
  const query = await searchParams;
  const qs = new URLSearchParams();
  if (query.google) qs.set("google", query.google);
  if (query.microsoft) qs.set("microsoft", query.microsoft);
  if (query.zoom) qs.set("zoom", query.zoom);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const hash = query.google || query.microsoft || query.zoom ? "calendar" : "hours";
  return <SettingsAliasRedirect href={`/settings/account${suffix}#${hash}`} />;
}
