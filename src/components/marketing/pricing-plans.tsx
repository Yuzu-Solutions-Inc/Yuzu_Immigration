import { Check, Link2, LockKeyhole, Package } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentType } from "react";

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
    Icon: Package,
    tone: "indigo",
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
      "roles",
      "retention",
    ],
  },
  {
    key: "integrations",
    Icon: Link2,
    tone: "emerald",
    items: [
      "calendar",
      "meetings",
      "payments",
      "sage",
      "noCut",
    ],
  },
  {
    key: "security",
    Icon: LockKeyhole,
    tone: "amber",
    items: [
      "orgEncryption",
      "transit",
      "noAi",
      "canada",
      "humanReview",
      "privacy",
    ],
  },
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
          size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
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

function FeatureGroup({
  title,
  Icon,
  items,
  tone,
}: {
  title: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  items: string[];
  tone: "indigo" | "emerald" | "amber";
}) {
  const iconClass =
    tone === "emerald"
      ? "bg-emerald-100 text-success"
      : tone === "amber"
        ? "bg-amber-100 text-warning"
        : "bg-indigo-100 text-action";
  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-5 sm:px-6 sm:py-6">
      <h3 className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight text-brand">
        <span
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg",
            iconClass,
          )}
        >
          <Icon className="size-4" strokeWidth={2} aria-hidden />
        </span>
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {items.map((feature) => (
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
    </section>
  );
}

export async function PricingPlanCards(_props: {
  variant: "teaser" | "page";
}) {
  const [t, localeRaw] = await Promise.all([
    getTranslations("pricing"),
    getLocale(),
  ]);
  const locale = toAppLocale(localeRaw);
  const foundingFirst = formatCadMonthly(
    PRICING.standard.foundingMonthly,
    locale,
  );
  const extraFounding = formatCadMonthly(extraSeatMonthlyCad(true), locale);

  return (
    <div className="w-full space-y-8">
      <article className="rounded-xl border border-action/35 bg-surface p-6 sm:p-8 lg:p-10">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-xl font-semibold tracking-tight text-brand sm:text-2xl">
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

        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-canvas px-5 py-5">
            <dt className="text-sm font-medium text-muted-foreground">
              {t("firstSeat")}
            </dt>
            <dd className="mt-2">
              <CadMonthlyPrice
                amount={PRICING.standard.listMonthly}
                locale={locale}
                size="lg"
              />
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-canvas px-5 py-5">
            <dt className="text-sm font-medium text-muted-foreground">
              {t("extraSeat")}
            </dt>
            <dd className="mt-2">
              <CadMonthlyPrice
                amount={PRICING.extraSeatMonthly}
                locale={locale}
                size="md"
                prefix="+"
              />
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
          {t("seatHint")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground text-pretty">
          {t("yearlyPrice", {
            amount: formatCadYearly(
              annualTotal(PRICING.standard.listMonthly),
              locale,
            ),
            free: PRICING.annualFreeMonths,
          })}
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <aside className="rounded-xl border border-action/20 bg-action/5 px-5 py-4">
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
          <Link
            href="/login?mode=signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full lg:min-w-[16rem] lg:w-auto",
            )}
          >
            {t("cta")}
          </Link>
        </div>
      </article>

      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold tracking-tight text-brand sm:text-xl">
          {t("features.title")}
        </h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {FEATURE_GROUPS.map((group) => (
            <FeatureGroup
              key={group.key}
              title={t(`features.${group.key}.title`)}
              Icon={group.Icon}
              tone={group.tone}
              items={group.items.map((item) =>
                t(`features.${group.key}.${item}`),
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
