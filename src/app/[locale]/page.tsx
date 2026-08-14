import { setRequestLocale } from "next-intl/server";

import { LandingPage } from "@/components/marketing/landing-page";

export default async function MarketingHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LandingPage />;
}
