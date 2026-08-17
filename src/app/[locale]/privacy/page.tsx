import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { LegalDownloads } from "@/components/legal/legal-downloads";

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
