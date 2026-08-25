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
    items: ["unlimited", "questionnaire", "pdfFill", "contracts"],
  },
  {
    key: "integrations",
    items: ["calendar", "meetings", "payments", "noCut"],
  },
  {
    key: "security",
    items: ["orgEncryption", "transit", "noAi", "canada"],
  },
] as const;

function PriceTile({
  label,
  offerMonthly,
  listMonthly,
  locale,
  saveLabel,
  prefix,
}: {
  label: string;
  offerMonthly: number;
  listMonthly: number;
  locale: AppLocale;
  saveLabel: string;
  prefix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-action px-2 text-[11px] font-medium text-action-foreground">
          {saveLabel}
        </span>
      </div>
      <p className="mt-3 inline-flex items-baseline gap-2 tabular-nums">
        <span className="font-heading text-4xl font-bold tracking-tight text-brand sm:text-[2.75rem]">
          {prefix}
          {formatCadAmount(offerMonthly, locale)}
        </span>
        <span className="text-base font-medium text-muted-foreground">
          {cadMonthlyPeriod(locale)}
        </span>
        <span className="text-sm font-medium text-muted-foreground line-through">
          {prefix}
          {formatCadMonthly(listMonthly, locale)}
        </span>
      </p>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        {prefix}
        {formatCadYearly(annualTotal(offerMonthly), locale)}
      </p>
    </div>
  );
}

function FeatureList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <section>
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">
        {title}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-2 text-sm leading-snug text-muted-foreground"
          >
            <Check
              className="mt-0.5 size-3.5 shrink-0 text-action"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="text-pretty">{item}</span>
          </li>
        ))}
      </ul>
    </section>
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
  const groups = FEATURE_GROUPS.map((group) => ({
    key: group.key,
    title: t(`features.${group.key}.title`),
    items: group.items.map((item) => t(`features.${group.key}.${item}`)),
  }));

  const offer = (
    <article className="overflow-hidden rounded-xl border border-action/35 bg-surface">
      <div className="bg-action px-5 py-4 text-action-foreground sm:px-6">
        <p className="font-heading text-sm font-semibold tracking-tight">
          {t("foundingTitle", { count: PRICING.foundingCohortSize })}
        </p>
        <p className="mt-1 font-heading text-base font-semibold tracking-tight text-pretty sm:text-lg">
          {t("foundingCut", {
            firstOff: formatCadMonthly(firstSave, locale),
            extraOff: formatCadMonthly(extraSave, locale),
          })}
        </p>
        <p className="mt-1 text-xs text-white/80 text-pretty">
          {t("foundingHelp", { code: PRICING.foundingPromoCode })}
        </p>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-lg font-semibold tracking-tight text-brand">
            {t("plan.name")}
          </h3>
          <span className="inline-flex h-5 items-center rounded-full bg-action/10 px-2 text-[11px] font-medium text-action">
            {t("plan.badge")}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PriceTile
            label={t("firstSeat")}
            offerMonthly={PRICING.standard.foundingMonthly}
            listMonthly={PRICING.standard.listMonthly}
            locale={locale}
            saveLabel={t("save", {
              amount: formatCadMonthly(firstSave, locale),
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
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/login?mode=signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full sm:w-auto sm:min-w-[14rem]",
            )}
          >
            {t("cta")}
          </Link>
          <p className="text-sm text-muted-foreground text-pretty sm:max-w-xs sm:text-right">
            {t("seatHint")}
          </p>
        </div>
      </div>
    </article>
  );

  if (variant === "teaser") {
    return (
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:gap-10">
        {offer}
        <div className="lg:pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-base font-semibold tracking-tight text-brand">
              {t("features.title")}
            </h3>
            <Link
              href="/pricing"
              className="shrink-0 text-sm font-medium text-action hover:underline"
            >
              {t("teaser.compare")}
            </Link>
          </div>
          <div className="mt-5 grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
            {groups.map((group) => (
              <FeatureList
                key={group.key}
                title={group.title}
                items={group.items}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {offer}
      <div>
        <h3 className="font-heading text-base font-semibold tracking-tight text-brand">
          {t("features.title")}
        </h3>
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          {groups.map((group) => (
            <FeatureList
              key={group.key}
              title={group.title}
              items={group.items}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
