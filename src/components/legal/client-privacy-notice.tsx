import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/** Compact PIPEDA-oriented notice for client share / fill flows. */
export async function ClientPrivacyNotice({
  token,
}: {
  token?: string;
}) {
  const t = await getTranslations("legal");

  return (
    <aside
      className="rounded-lg border border-border/70 bg-canvas/80 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground"
      aria-label={t("consentTitle")}
    >
      <p className="font-medium text-brand/80">{t("consentTitle")}</p>
      <p className="mt-1.5">{t("consentBody")}</p>
      <p className="mt-2">
        <Link
          href="/privacy"
          className="underline-offset-2 hover:underline"
          {...(token ? {} : {})}
        >
          {t("privacyLink")}
        </Link>
      </p>
    </aside>
  );
}
