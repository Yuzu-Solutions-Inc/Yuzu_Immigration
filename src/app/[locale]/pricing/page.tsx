import { getTranslations, setRequestLocale } from "next-intl/server";

import { PricingPage } from "@/components/marketing/pricing-page";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return publicPageMetadata({
    locale,
    path: "/pricing",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function MarketingPricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PricingPage />;
}
