import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  formatCadMonthly,
  formatCadYearly,
  PRICING,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

const STANDARD_FEATURE_KEYS = [
  "staff",
  "extraSeat",
  "files",
  "portal",
  "booking",
  "contracts",
  "payments",
  "languages",
] as const;

const TEAM_FEATURE_KEYS = [
  "staff",
  "sameProduct",
  "extraSeat",
  "files",
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

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2 lg:items-stretch">
      <PlanCard
        name={t("standard.name")}
        audience={t("standard.audience")}
        badge={t("standard.badge")}
        lead={t("trial.lead", { days: PRICING.trialDays })}
        price={formatCadMonthly(PRICING.standard.foundingMonthly, locale)}
        yearly={t("yearlyPrice", {
          amount: formatCadYearly(
            annualTotal(PRICING.standard.foundingMonthly),
            locale,
          ),
          free: PRICING.annualFreeMonths,
        })}
        footnote={t("foundingHelp", {
          months: PRICING.promoMonths,
          count: PRICING.foundingCohortSize,
        })}
        thenLabel={t("thenList")}
        list={formatCadMonthly(PRICING.standard.listMonthly, locale)}
        listYearly={formatCadYearly(
          annualTotal(PRICING.standard.listMonthly),
          locale,
        )}
        features={
          detailed
            ? STANDARD_FEATURE_KEYS.map((key) =>
                t(`standard.features.${key}`, { price: extraSeat }),
              )
            : [
                t("standard.teaser"),
                t("extraSeats", { price: extraSeat }),
              ]
        }
        cta={t("cta")}
        highlighted
      />
      <PlanCard
        name={t("team.name")}
        audience={t("team.audience")}
        badge={t("team.badge")}
        price={formatCadMonthly(PRICING.team.foundingMonthly, locale)}
        yearly={t("yearlyPrice", {
          amount: formatCadYearly(
            annualTotal(PRICING.team.foundingMonthly),
            locale,
          ),
          free: PRICING.annualFreeMonths,
        })}
        footnote={t("foundingHelp", {
          months: PRICING.promoMonths,
          count: PRICING.foundingCohortSize,
        })}
        thenLabel={t("thenList")}
        list={formatCadMonthly(PRICING.team.listMonthly, locale)}
        listYearly={formatCadYearly(
          annualTotal(PRICING.team.listMonthly),
          locale,
        )}
        features={
          detailed
            ? TEAM_FEATURE_KEYS.map((key) =>
                t(`team.features.${key}`, { price: extraSeat }),
              )
            : [t("team.teaser"), t("extraSeats", { price: extraSeat })]
        }
        cta={t("cta")}
        highlighted={false}
      />
    </div>
  );
}

function PlanCard({
  name,
  audience,
  badge,
  lead,
  price,
  yearly,
  footnote,
  thenLabel,
  list,
  listYearly,
  features,
  cta,
  highlighted,
}: {
  name: string;
  audience: string;
  badge?: string;
  lead?: string;
  price: string;
  yearly: string;
  footnote?: string;
  thenLabel?: string;
  list?: string;
  listYearly?: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-6 sm:p-7",
        highlighted ? "border-action/35" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-xl font-semibold tracking-tight text-brand">
          {name}
        </h3>
        {badge ? (
          <span className="inline-flex h-5 items-center rounded-full bg-action px-2 text-[11px] font-medium text-action-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{audience}</p>

      {lead ? (
        <p className="mt-5 text-sm font-medium text-action">{lead}</p>
      ) : null}
      <p
        className={cn(
          "font-heading text-4xl font-bold tracking-tight text-brand",
          lead ? "mt-1" : "mt-5",
        )}
      >
        {price}
      </p>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{yearly}</p>
      {footnote ? (
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {footnote}
        </p>
      ) : null}
      {thenLabel && list ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {thenLabel}{" "}
          <span className="font-medium text-brand">{list}</span>
          {listYearly ? (
            <span className="text-muted-foreground"> · {listYearly}</span>
          ) : null}
        </p>
      ) : null}

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
        className={cn(
          buttonVariants({
            variant: highlighted ? "default" : "outline",
            size: "lg",
          }),
          "mt-8 w-full",
        )}
      >
        {cta}
      </Link>
    </article>
  );
}
