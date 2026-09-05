import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import {
  FIRM_DPA_DOWNLOAD_FILE,
  legalDownloadHref,
} from "@/lib/legal/downloads";
import { publicPageMetadata } from "@/lib/seo";
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
          href={legalDownloadHref(FIRM_DPA_DOWNLOAD_FILE, locale)}
          download={FIRM_DPA_DOWNLOAD_FILE}
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
  return publicPageMetadata({
    locale,
    path: "/dpa",
    title: t("dpaTitle"),
    description: t("dpaMetaDescription"),
  });
}
