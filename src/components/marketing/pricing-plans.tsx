import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  extraSeatMonthlyCad,
  formatCadMonthly,
  formatCadYearly,
  PRICING,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

const FEATURE_KEYS = [
  "staff",
  "extraSeat",
  "files",
  "portal",
  "booking",
  "contracts",
  "payments",
  "languages",
] as const;

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
  const extraSeat = formatCadMonthly(PRICING.extraSeatMonthly, locale);
  const extraFounding = formatCadMonthly(
    extraSeatMonthlyCad(true),
    locale,
  );
  const foundingFirst = formatCadMonthly(
    PRICING.standard.foundingMonthly,
    locale,
  );

  return (
    <div className="mx-auto max-w-md">
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
        <p className="mt-5 text-sm font-medium text-action">
          {t("trial.lead", { days: PRICING.trialDays })}
        </p>
        <p className="mt-1 font-heading text-4xl font-bold tracking-tight text-brand">
          {formatCadMonthly(PRICING.standard.listMonthly, locale)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {t("yearlyPrice", {
            amount: formatCadYearly(
              annualTotal(PRICING.standard.listMonthly),
              locale,
            ),
            free: PRICING.annualFreeMonths,
          })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {t("foundingHelp", {
            count: PRICING.foundingCohortSize,
            code: PRICING.foundingPromoCode,
            founding: foundingFirst,
            extra: extraFounding,
          })}
        </p>
        <ul className="mt-6 flex-1 space-y-2.5">
          {(detailed
            ? FEATURE_KEYS.map((key) =>
                t(`plan.features.${key}`, { price: extraSeat }),
              )
            : [
                t("plan.teaser"),
                t("extraSeats", { price: extraSeat }),
              ]
          ).map((feature) => (
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

