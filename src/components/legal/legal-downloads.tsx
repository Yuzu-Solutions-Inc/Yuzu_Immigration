"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  LEGAL_DOWNLOAD_FILES,
  legalDownloadHref,
} from "@/lib/legal/downloads";

export function LegalDownloads({
  headingId = "legal-downloads",
}: {
  headingId?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("legal.downloads");
  const yuzu = LEGAL_DOWNLOAD_FILES.filter((item) => item.group === "yuzu");
  const firm = LEGAL_DOWNLOAD_FILES.filter((item) => item.group === "firm");

  return (
    <section className="space-y-4" aria-labelledby={headingId}>
      <div className="space-y-2">
        <h2
          id={headingId}
          className="font-heading text-lg font-semibold text-brand"
        >
          {t("title")}
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
          {t("help")}
        </p>
      </div>
      <DownloadGroup title={t("groupYuzu")} items={yuzu} locale={locale} t={t} />
      <DownloadGroup title={t("groupFirm")} items={firm} locale={locale} t={t} />
    </section>
  );
}

function DownloadGroup({
  title,
  items,
  locale,
  t,
}: {
  title: string;
  items: readonly (typeof LEGAL_DOWNLOAD_FILES)[number][];
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-brand">{title}</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={legalDownloadHref(item.file, locale)}
              download={item.file}
              className="flex flex-col gap-0.5 px-3 py-2.5 text-action transition-colors hover:bg-muted"
            >
              <span className="font-medium">{t(`items.${item.id}.label`)}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t(`items.${item.id}.hint`)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
