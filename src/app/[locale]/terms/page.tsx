import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { publicPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return publicPageMetadata({
    locale,
    path: "/terms",
    title: t("termsTitle"),
    description: t("termsMetaDescription"),
  });
}

const SECTIONS = [
  "agreement",
  "parties",
  "service",
  "noProfessionalRelationship",
  "accounts",
  "firmDuties",
  "clientUse",
  "acceptableUse",
  "fees",
  "ip",
  "privacy",
  "thirdParties",
  "disclaimers",
  "liability",
  "indemnity",
  "consumerRights",
  "termination",
  "changes",
  "governingLaw",
  "language",
  "severability",
  "contact",
] as const;

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const app = await getTranslations("app");

  return (
    <LegalDocument
      title={t("termsTitle")}
      updated={t("termsUpdated")}
      intro={t("termsIntro")}
      backHomeLabel={t("backHome")}
      appName={app("name")}
      sections={SECTIONS.map((id) => ({
        id,
        title: t(`termsSections.${id}.title`),
        body: t(`termsSections.${id}.body`),
      }))}
    />
  );
}
