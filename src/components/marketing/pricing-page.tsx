import { getLocale, getTranslations } from "next-intl/server";

import {
  MarketingFinalCta,
  MarketingFooter,
  MarketingHeader,
  MarketingTestingBanner,
} from "@/components/marketing/marketing-chrome";
import { PricingPlanCards } from "@/components/marketing/pricing-plans";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  formatCadMonthly,
  formatCadYearly,
  PRICING,
} from "@/lib/marketing/pricing";

const COMPARE_KEYS = [
  "staff",
  "extraSeat",
  "files",
  "portal",
  "forms",
  "booking",
  "meetings",
  "contracts",
  "payments",
  "sage",
  "languages",
  "canada",
] as const;

const FAQ_KEYS = [
  "founding",
  "after",
  "annual",
  "difference",
  "starter",
  "files",
  "roles",
  "currency",
] as const;

function faqParams(
  key: (typeof FAQ_KEYS)[number],
  extraSeat: string,
  locale: AppLocale,
): Record<string, string | number> {
  switch (key) {
    case "founding":
      return {
        count: PRICING.foundingCohortSize,
        months: PRICING.promoMonths,
      };
    case "after":
      return {
        months: PRICING.promoMonths,
        days: PRICING.priceChangeNoticeDays,
        starterList: formatCadMonthly(PRICING.starter.listMonthly, locale),
        standardList: formatCadMonthly(PRICING.standard.listMonthly, locale),
        teamList: formatCadMonthly(PRICING.team.listMonthly, locale),
      };
    case "annual":
      return {
        paid: PRICING.annualMonthsPaid,
        free: PRICING.annualFreeMonths,
        starterAnnual: formatCadYearly(
          annualTotal(PRICING.starter.listMonthly),
          locale,
        ),
        standardAnnual: formatCadYearly(
          annualTotal(PRICING.standard.foundingMonthly),
          locale,
        ),
        teamAnnual: formatCadYearly(
          annualTotal(PRICING.team.foundingMonthly),
          locale,
        ),
      };
    case "difference":
      return {
        starterProjects: PRICING.starter.activeProjects,
        standardUsers: PRICING.standard.includedUsers,
        teamUsers: PRICING.team.includedUsers,
        extraSeat,
      };
    case "starter":
      return {
        count: PRICING.starter.activeProjects,
        price: formatCadMonthly(PRICING.starter.listMonthly, locale),
      };
    case "files":
      return { count: PRICING.starter.activeProjects };
    default:
      return {};
  }
}

export async function PricingPage() {
  const [t, home, localeRaw] = await Promise.all([
    getTranslations("pricing"),
    getTranslations("home"),
    getLocale(),
  ]);
  const locale = toAppLocale(localeRaw);
  const nav = {
    pricing: home("navPricing"),
    signIn: home("navSignIn"),
    cta: home("navCta"),
    footerTagline: home("footerTagline"),
  };

  const extraSeat = formatCadMonthly(PRICING.team.extraSeatMonthly, locale);
  const included = t("compare.included");
  const notIncluded = t("compare.notIncluded");
  const staffOne = t("compare.staffStandard", {
    count: PRICING.starter.includedUsers,
  });

  const compareValues: Record<
    (typeof COMPARE_KEYS)[number],
    { starter: string; standard: string; team: string }
  > = {
    staff: {
      starter: staffOne,
      standard: staffOne,
      team: t("compare.staffTeam", { count: PRICING.team.includedUsers }),
    },
    extraSeat: {
      starter: notIncluded,
      standard: t("compare.upgrade"),
      team: extraSeat,
    },
    files: {
      starter: t("compare.filesStarter", {
        count: PRICING.starter.activeProjects,
      }),
      standard: t("compare.filesUnlimited"),
      team: t("compare.filesUnlimited"),
    },
    portal: { starter: included, standard: included, team: included },
    forms: { starter: included, standard: included, team: included },
    booking: { starter: included, standard: included, team: included },
    meetings: {
      starter: t("compare.meetOnly"),
      standard: t("compare.meetFull"),
      team: t("compare.meetFull"),
    },
    contracts: { starter: included, standard: included, team: included },
    payments: { starter: included, standard: included, team: included },
    sage: { starter: notIncluded, standard: included, team: included },
    languages: { starter: included, standard: included, team: included },
    canada: { starter: included, standard: included, team: included },
  };

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-x-hidden bg-canvas">
      <MarketingHeader copy={nav} active="pricing" />
      <MarketingTestingBanner>{t("testingBanner")}</MarketingTestingBanner>

      <section className="border-b border-border bg-canvas py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl space-y-8 px-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
            {t("title")}
          </h1>

          <PricingPlanCards variant="page" />
          <p className="text-sm text-muted-foreground">{t("currencyNote")}</p>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-brand text-pretty sm:text-3xl">
            {t("compare.title")}
          </h2>

          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-[15px]">
              <caption className="sr-only">{t("compare.title")}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="py-3 pr-4 font-heading text-sm font-semibold text-brand">
                    {t("compare.feature")}
                  </th>
                  <th className="px-4 py-3 font-heading text-sm font-semibold text-brand">
                    {t("starter.name")}
                  </th>
                  <th className="px-4 py-3 font-heading text-sm font-semibold text-brand">
                    {t("standard.name")}
                  </th>
                  <th className="px-4 py-3 font-heading text-sm font-semibold text-brand">
                    {t("team.name")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_KEYS.map((key) => (
                  <tr key={key} className="border-b border-border/80">
                    <th className="py-3.5 pr-4 font-medium text-brand">
                      {t(`compare.rows.${key}`)}
                    </th>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {compareValues[key].starter}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {compareValues[key].standard}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {compareValues[key].team}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-canvas py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-brand text-pretty sm:text-3xl">
            {t("faq.title")}
          </h2>
          <dl className="mt-10 grid gap-10 sm:grid-cols-2">
            {FAQ_KEYS.map((key) => (
              <div key={key} className="space-y-2">
                <dt className="font-heading text-base font-semibold text-brand">
                  {t(`faq.${key}.q`)}
                </dt>
                <dd className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                  {t(`faq.${key}.a`, faqParams(key, extraSeat, locale))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <MarketingFinalCta
        title={home("finalTitle")}
        cta={home("finalCta")}
        secondaryCta={home("secondaryCta")}
      />
      <MarketingFooter copy={nav} />
    </main>
  );
}
