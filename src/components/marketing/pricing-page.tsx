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
  extraSeatMonthlyCad,
  formatCadMonthly,
  formatCadYearly,
  PRICING,
} from "@/lib/marketing/pricing";

const FAQ_KEYS = [
  "trial",
  "seats",
  "files",
  "annual",
  "founding",
  "after",
  "roles",
  "currency",
] as const;

const SEAT_EXAMPLES = [1, 2, 3] as const;

const SEAT_EXAMPLE_KEYS = ["you", "colleague", "team"] as const;

function monthlyForStaff(count: number, founding: boolean): number {
  const extra = Math.max(0, count - PRICING.standard.includedUsers);
  return founding
    ? PRICING.standard.foundingMonthly + extra * extraSeatMonthlyCad(true)
    : PRICING.standard.listMonthly + extra * PRICING.extraSeatMonthly;
}

function faqParams(
  key: (typeof FAQ_KEYS)[number],
  extraSeat: string,
  locale: AppLocale,
): Record<string, string | number> {
  switch (key) {
    case "trial":
      return { days: PRICING.trialDays };
    case "founding":
      return {
        count: PRICING.foundingCohortSize,
        code: PRICING.foundingPromoCode,
        founding: formatCadMonthly(PRICING.standard.foundingMonthly, locale),
        extraFounding: formatCadMonthly(extraSeatMonthlyCad(true), locale),
      };
    case "after":
      return {
        days: PRICING.priceChangeNoticeDays,
        list: formatCadMonthly(PRICING.standard.listMonthly, locale),
        extra: extraSeat,
      };
    case "annual":
      return {
        paid: PRICING.annualMonthsPaid,
        free: PRICING.annualFreeMonths,
        annual: formatCadYearly(
          annualTotal(PRICING.standard.listMonthly),
          locale,
        ),
      };
    case "seats":
      return { extraSeat };
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

  const extraSeat = formatCadMonthly(PRICING.extraSeatMonthly, locale);

  return (
    <main className="relative flex min-h-full flex-1 flex-col overflow-x-hidden bg-canvas">
      <MarketingHeader copy={nav} active="pricing" />
      <MarketingTestingBanner>{t("testingBanner")}</MarketingTestingBanner>

      <section className="border-b border-border bg-canvas py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl space-y-10 px-6">
          <header className="max-w-2xl space-y-3">
            <p className="font-heading text-sm font-semibold tracking-[0.16em] text-action">
              {t("eyebrow")}
            </p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("title")}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground text-pretty sm:text-[17px]">
              {t("subtitle")}
            </p>
          </header>

          <PricingPlanCards variant="page" />
          <p className="text-center text-sm text-muted-foreground">
            {t("currencyNote")}
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-brand text-pretty sm:text-3xl">
            {t("examples.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {t("examples.subtitle")}
          </p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {SEAT_EXAMPLES.map((count, index) => (
              <li
                key={count}
                className="rounded-xl border border-border bg-canvas px-5 py-5"
              >
                <p className="text-sm font-medium text-muted-foreground">
                  {t("examples.seats", { count })}
                </p>
                <p className="mt-2 inline-flex items-baseline gap-2 tabular-nums">
                  <span className="font-heading text-3xl font-bold tracking-tight text-brand">
                    {formatCadMonthly(monthlyForStaff(count, true), locale)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground line-through">
                    {formatCadMonthly(monthlyForStaff(count, false), locale)}
                  </span>
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {formatCadYearly(annualTotal(monthlyForStaff(count, true)), locale)}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground text-pretty">
                  {t(`examples.${SEAT_EXAMPLE_KEYS[index]}`)}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground text-pretty">
            {t("examples.footnote")}
          </p>
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
        subtitle={home("finalSubtitle")}
        cta={home("finalCta")}
        secondaryCta={home("secondaryCta")}
        note={home("finalNote")}
      />
      <MarketingFooter copy={nav} />
    </main>
  );
}
