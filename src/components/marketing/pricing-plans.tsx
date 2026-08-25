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

const FEATURE_GROUPS = [
  {
    key: "included",
    items: [
      "unlimited",
      "portal",
      "questionnaire",
      "pdfFill",
      "bookingForms",
      "contracts",
      "reminders",
      "projectBookings",
      "documents",
      "languages",
    ],
  },
  {
    key: "integrations",
    items: ["calendar", "meetings", "payments", "sage", "noCut"],
  },
  {
    key: "security",
    items: ["orgEncryption", "transit", "noAi", "canada", "humanReview"],
  },
] as const;

const TEASER_HIGHLIGHTS = [
  ["included", "unlimited"],
  ["included", "questionnaire"],
  ["included", "pdfFill"],
  ["included", "contracts"],
  ["integrations", "calendar"],
  ["integrations", "meetings"],
  ["integrations", "payments"],
  ["security", "noAi"],
] as const;

function PriceTile({
  label,
  offerMonthly,
  listMonthly,
  locale,
  saveLabel,
  yearlyLabel,
  prefix,
}: {
  label: string;
  offerMonthly: number;
  listMonthly: number;
  locale: AppLocale;
  saveLabel: string;
  yearlyLabel: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-canvas px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="inline-flex h-5 items-center rounded-full bg-action px-2 text-[11px] font-medium text-action-foreground">
          {saveLabel}
        </span>
      </div>
      <p className="mt-3 inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="inline-flex items-baseline tabular-nums text-brand">
          <span className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            {prefix}
            {formatCadAmount(offerMonthly, locale)}
          </span>
          <span className="text-base font-medium text-muted-foreground">
            {cadMonthlyPeriod(locale)}
          </span>
        </span>
        <span className="text-sm font-medium text-muted-foreground line-through tabular-nums">
          {prefix}
          {formatCadMonthly(listMonthly, locale)}
        </span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{yearlyLabel}</p>
    </div>
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
  const firstSave = PRICING.standard.listMonthly - PRICING.standard.foundingMonthly;
  const extraSave = PRICING.extraSeatMonthly - extraSeatMonthlyCad(true);

  return (
    <div className="w-full space-y-8">
      <article className="overflow-hidden rounded-xl border border-action/35 bg-surface">
        <div className="flex flex-col gap-1 bg-action px-5 py-3.5 text-action-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-7">
          <p className="font-heading text-sm font-semibold tracking-tight">
            {t("foundingTitle", { count: PRICING.foundingCohortSize })}
          </p>
          <p className="text-sm text-white/85 text-pretty">
            {t("foundingHelp", { code: PRICING.foundingPromoCode })}
          </p>
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-xl font-semibold tracking-tight text-brand">
              {t("plan.name")}
            </h3>
            <span className="inline-flex h-5 items-center rounded-full bg-action/10 px-2 text-[11px] font-medium text-action">
              {t("plan.badge")}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <PriceTile
              label={t("firstSeat")}
              offerMonthly={PRICING.standard.foundingMonthly}
              listMonthly={PRICING.standard.listMonthly}
              locale={locale}
              saveLabel={t("save", {
                amount: formatCadMonthly(firstSave, locale),
              })}
              yearlyLabel={t("yearlyOnCard", {
                amount: formatCadYearly(
                  annualTotal(PRICING.standard.foundingMonthly),
                  locale,
                ),
                free: PRICING.annualFreeMonths,
              })}
            />
            <PriceTile
              label={t("extraSeat")}
              offerMonthly={extraSeatMonthlyCad(true)}
              listMonthly={PRICING.extraSeatMonthly}
              locale={locale}
              prefix="+"
              saveLabel={t("save", {
                amount: formatCadMonthly(extraSave, locale),
              })}
              yearlyLabel={t("yearlyOnCard", {
                amount: formatCadYearly(
                  annualTotal(extraSeatMonthlyCad(true)),
                  locale,
                ),
                free: PRICING.annualFreeMonths,
              })}
            />
          </div>

          <p className="mt-4 text-sm text-muted-foreground text-pretty">
            {t("seatHint")}
          </p>

          <Link
            href="/login?mode=signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-5 w-full sm:w-auto sm:min-w-[16rem]",
            )}
          >
            {t("cta")}
          </Link>
        </div>
      </article>

      {variant === "teaser" ? (
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-heading text-lg font-semibold tracking-tight text-brand">
              {t("features.title")}
            </h3>
            <Link
              href="/pricing"
              className="text-sm font-medium text-action hover:underline"
            >
              {t("teaser.compare")}
            </Link>
          </div>
          <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {TEASER_HIGHLIGHTS.map(([group, item]) => (
              <li
                key={`${group}-${item}`}
                className="flex gap-2.5 text-[15px] leading-snug text-muted-foreground"
              >
                <Check
                  className="mt-0.5 size-4 shrink-0 text-action"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-pretty">
                  {t(`features.${group}.${item}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <h3 className="font-heading text-lg font-semibold tracking-tight text-brand">
            {t("features.title")}
          </h3>
          <div className="mt-5 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GROUPS.map((group) => (
              <section key={group.key}>
                <p className="font-heading text-sm font-semibold tracking-tight text-brand">
                  {t(`features.${group.key}.title`)}
                </p>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-snug text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 size-3.5 shrink-0 text-action"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="text-pretty">
                        {t(`features.${group.key}.${item}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
