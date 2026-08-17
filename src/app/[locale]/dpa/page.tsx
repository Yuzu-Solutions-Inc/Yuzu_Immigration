import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { legalDownloadHref } from "@/lib/legal/downloads";
import { FIRM_DPA_VERSION } from "@/lib/legal/dpa";
import {
  loadFirmDpaMarkdown,
  parseMarkdownLegalDocument,
} from "@/lib/legal/dpa-document";

export default async function FirmDpaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const app = await getTranslations("app");
  const parsed = parseMarkdownLegalDocument(await loadFirmDpaMarkdown(locale));

  return (
    <LegalDocument
      title={parsed.title}
      updated={t("dpaUpdated", { version: FIRM_DPA_VERSION })}
      intro={parsed.intro}
      backHomeLabel={t("backHome")}
      appName={app("name")}
      sections={parsed.sections}
    >
      <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
        {t("dpaCountersignHelp")}{" "}
        <a
          href={legalDownloadHref(
            "firm-data-processing-addendum.md",
            locale,
          )}
          download="firm-data-processing-addendum.md"
          className="text-action underline-offset-2 hover:underline"
        >
          {t("dpaDownload")}
        </a>
      </p>
    </LegalDocument>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("dpaTitle") };
}
