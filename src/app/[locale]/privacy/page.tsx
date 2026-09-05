import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { LegalDownloads } from "@/components/legal/legal-downloads";
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
    path: "/privacy",
    title: t("privacyTitle"),
    description: t("privacyMetaDescription"),
  });
}

const SECTIONS = [
  "controller",
  "officer",
  "purposes",
  "collection",
  "legalBasis",
  "governance",
  "safeguards",
  "retention",
  "sharing",
  "transfers",
  "cookies",
  "rights",
  "breach",
  "children",
  "automated",
  "changes",
  "contact",
] as const;

export default async function PrivacyPolicyPage({
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
      title={t("privacyTitle")}
      updated={t("privacyUpdated")}
      intro={t("privacyIntro")}
      backHomeLabel={t("backHome")}
      appName={app("name")}
      sections={SECTIONS.map((id) => ({
        id,
        title: t(`sections.${id}.title`),
        body: t(`sections.${id}.body`),
      }))}
    >
      <LegalDownloads />
    </LegalDocument>
  );
}
