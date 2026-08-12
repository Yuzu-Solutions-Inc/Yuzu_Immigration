import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { Link } from "@/i18n/navigation";

const SECTIONS = [
  "controller",
  "purposes",
  "collection",
  "legalBasis",
  "safeguards",
  "retention",
  "sharing",
  "transfers",
  "rights",
  "breach",
  "children",
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
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 pb-16">
      <header className="space-y-4 border-b border-border pb-6">
        <BrandLogo size="sm" />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
            {t("privacyTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("privacyUpdated")}</p>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {t("privacyIntro")}
          </p>
        </div>
      </header>

      <article className="space-y-8">
        {SECTIONS.map((key) => (
          <section key={key} className="space-y-2" id={key}>
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t(`sections.${key}.title`)}
            </h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {t(`sections.${key}.body`)}
            </p>
          </section>
        ))}
      </article>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>{app("name")}</p>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:underline">
            {t("backHome")}
          </Link>
          <PrivacyLink />
        </div>
      </footer>
    </main>
  );
}
