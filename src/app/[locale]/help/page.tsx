import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  PublicInfoBody,
  PublicInfoPage,
  PublicInfoSection,
} from "@/components/legal/public-info-page";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { product } from "@/lib/brand/product";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function HelpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("help");
  const legal = await getTranslations("legal");
  const app = await getTranslations("app");
  const email = product.supportEmail;
  const mailto = `mailto:${email}`;

  return (
    <PublicInfoPage
      title={t("title")}
      intro={t("intro")}
      backHomeLabel={legal("backHome")}
      appName={app("name")}
    >
      <article className="space-y-8">
        <PublicInfoSection id="contact" title={t("contactTitle")}>
          <PublicInfoBody>{t("contactBody")}</PublicInfoBody>
          <div className="flex flex-col items-start gap-3 pt-1">
            <a
              href={mailto}
              className="font-medium text-action underline-offset-2 hover:underline"
            >
              {email}
            </a>
            <div className="flex flex-wrap gap-2">
              <a href={mailto} className={cn(buttonVariants())}>
                {t("emailCta")}
              </a>
              <Link
                href="/docs"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("docsCta")}
              </Link>
            </div>
          </div>
        </PublicInfoSection>
        <PublicInfoSection id="hours" title={t("hoursTitle")}>
          <PublicInfoBody>{t("hoursBody")}</PublicInfoBody>
        </PublicInfoSection>
        <PublicInfoSection id="sla" title={t("slaTitle")}>
          <PublicInfoBody>{t("slaBody")}</PublicInfoBody>
        </PublicInfoSection>
      </article>
    </PublicInfoPage>
  );
}
