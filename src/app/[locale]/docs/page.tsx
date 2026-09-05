import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  PublicInfoBody,
  PublicInfoList,
  PublicInfoPage,
  PublicInfoSection,
} from "@/components/legal/public-info-page";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { publicPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

const ADD_STEPS = ["one", "two", "three", "four", "five"] as const;
const REMOVE_DOSSIERLY_STEPS = ["one", "two", "three"] as const;
const REMOVE_ZOOM_STEPS = ["one", "two", "three"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "docs" });
  return publicPageMetadata({
    locale,
    path: "/docs",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("docs");
  const legal = await getTranslations("legal");
  const app = await getTranslations("app");

  return (
    <PublicInfoPage
      title={t("title")}
      intro={t("intro")}
      backHomeLabel={legal("backHome")}
      appName={app("name")}
    >
      <article className="space-y-10">
        <PublicInfoSection id="zoom" title={t("zoomTitle")}>
          <PublicInfoBody>{t("zoomIntro")}</PublicInfoBody>
        </PublicInfoSection>

        <PublicInfoSection id="add" title={t("addTitle")}>
          <PublicInfoBody>{t("addIntro")}</PublicInfoBody>
          <PublicInfoList items={ADD_STEPS.map((step) => t(`addSteps.${step}`))} />
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("addPrereqTitle")}
          </h3>
          <PublicInfoBody>{t("addPrereqBody")}</PublicInfoBody>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
            <Link
              href="/docs#troubleshooting"
              className="font-medium text-action underline-offset-2 hover:underline"
            >
              {t("troubleshootingLink")}
            </Link>
          </p>
        </PublicInfoSection>

        <PublicInfoSection id="usage" title={t("usageTitle")}>
          <PublicInfoBody>{t("usageIntro")}</PublicInfoBody>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("usageFeatureTitle")}
          </h3>
          <PublicInfoBody>{t("usageFeatureBody")}</PublicInfoBody>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("usagePrereqTitle")}
          </h3>
          <PublicInfoBody>{t("usagePrereqBody")}</PublicInfoBody>
        </PublicInfoSection>

        <PublicInfoSection id="remove" title={t("removeTitle")}>
          <PublicInfoBody>{t("removeIntro")}</PublicInfoBody>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("removeDossierlyTitle")}
          </h3>
          <PublicInfoList
            items={REMOVE_DOSSIERLY_STEPS.map((step) =>
              t(`removeDossierlySteps.${step}`),
            )}
          />
          <PublicInfoBody>{t("removeDossierlyBody")}</PublicInfoBody>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("removeZoomTitle")}
          </h3>
          <PublicInfoList
            items={REMOVE_ZOOM_STEPS.map((step) => t(`removeZoomSteps.${step}`))}
          />
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("removeDeauthTitle")}
          </h3>
          <PublicInfoBody>{t("removeDeauthBody")}</PublicInfoBody>
        </PublicInfoSection>

        <PublicInfoSection id="troubleshooting" title={t("troubleshootingTitle")}>
          <PublicInfoBody>{t("troubleshootingBody")}</PublicInfoBody>
          <Link href="/help" className={cn(buttonVariants())}>
            {t("helpCta")}
          </Link>
        </PublicInfoSection>

        <PublicInfoSection id="other" title={t("otherTitle")}>
          <PublicInfoBody>{t("otherBody")}</PublicInfoBody>
        </PublicInfoSection>
      </article>
    </PublicInfoPage>
  );
}
