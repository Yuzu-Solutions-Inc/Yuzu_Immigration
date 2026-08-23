import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  cadMonthlyPeriod,
  extraSeatMonthlyCad,
  formatCadAmount,
  formatCadMonthly,
  formatCadYearly,
  PRICING,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

const FEATURE_KEYS = [
  "files",
  "portal",
  "booking",
  "contracts",
  "payments",
  "languages",
] as const;

function CadMonthlyPrice({
  amount,
  locale,
  size,
  prefix,
}: {
  amount: number;
  locale: AppLocale;
  size: "lg" | "md";
  prefix?: string;
}) {
  return (
    <span className="inline-flex items-baseline tabular-nums text-brand">
      <span
        className={cn(
          "font-heading font-bold tracking-tight",
          size === "lg" ? "text-4xl" : "text-2xl",
        )}
      >
        {prefix}
        {formatCadAmount(amount, locale)}
      </span>
      <span
        className={cn(
          "font-medium text-muted-foreground",
          size === "lg" ? "text-base" : "text-sm",
        )}
      >
        {cadMonthlyPeriod(locale)}
      </span>
    </span>
  );
}

export async function PricingPlanCards({
  variant,
}: {
  variant: "teaser" | "page";
}) {
  const [t, localeRaw] = await Promise.all([
    getTranslations("pricing"),
    getLocale(),
  ]);
  const locale = toAppLocale(localeRaw);
  const detailed = variant === "page";
  const foundingFirst = formatCadMonthly(
    PRICING.standard.foundingMonthly,
    locale,
  );
  const extraFounding = formatCadMonthly(extraSeatMonthlyCad(true), locale);

  const features = detailed
    ? FEATURE_KEYS.map((key) => t(`plan.features.${key}`))
    : [t("plan.teaser")];

  return (
    <div className="mx-auto w-full max-w-lg">
      <article className="flex flex-col rounded-xl border border-action/35 bg-surface p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-xl font-semibold tracking-tight text-brand">
            {t("plan.name")}
          </h3>
          <span className="inline-flex h-5 items-center rounded-full bg-action px-2 text-[11px] font-medium text-action-foreground">
            {t("plan.badge")}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t("plan.audience")}</p>

        <p className="mt-6 text-sm font-medium text-action">
          {t("trial.lead", { days: PRICING.trialDays })}
        </p>

        <dl className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-canvas">
          <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
            <dt className="text-[15px] leading-snug text-brand">
              {t("firstSeat")}
            </dt>
            <dd>
              <CadMonthlyPrice
                amount={PRICING.standard.listMonthly}
                locale={locale}
                size="lg"
              />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
            <dt className="text-[15px] leading-snug text-brand">
              {t("extraSeat")}
            </dt>
            <dd>
              <CadMonthlyPrice
                amount={PRICING.extraSeatMonthly}
                locale={locale}
                size="md"
                prefix="+"
              />
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
          {t("seatHint")}
        </p>

        <p className="mt-3 text-sm text-muted-foreground text-pretty">
          {t("yearlyPrice", {
            amount: formatCadYearly(
              annualTotal(PRICING.standard.listMonthly),
              locale,
            ),
            free: PRICING.annualFreeMonths,
          })}
        </p>

        <aside className="mt-4 rounded-xl border border-action/20 bg-action/5 px-4 py-3">
          <p className="text-sm font-medium text-brand">
            {t("foundingTitle", { count: PRICING.foundingCohortSize })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            {t("foundingHelp", {
              code: PRICING.foundingPromoCode,
              founding: foundingFirst,
              extra: extraFounding,
            })}
          </p>
        </aside>

        <ul className="mt-6 flex-1 space-y-2.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex gap-2.5 text-[15px] leading-relaxed text-muted-foreground"
            >
              <Check
                className="mt-0.5 size-4 shrink-0 text-action"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-pretty">{feature}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/login?mode=signup"
          className={cn(buttonVariants({ size: "lg" }), "mt-8 w-full")}
        >
          {t("cta")}
        </Link>
      </article>
    </div>
  );
}
