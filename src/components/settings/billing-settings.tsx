"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  addLicensedSeatAction,
  openBillingPortalAction,
  startCheckoutAction,
  type BillingActionState,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import {
  catalogForOccupancy,
  catalogFromLicensed,
  type BillingInterval,
} from "@/lib/billing/plans";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  formatCadMonthly,
  formatCadYearly,
  type PricingPlanId,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

const initial: BillingActionState = {};

export function BillingSettingsForm({
  locale,
  configured,
  subscribed,
  trialEndsAt,
  periodEndsAt,
  foundingEligible,
  foundingLockedIn,
  currentPlan,
  currentInterval,
  seatQuantity,
  occupancy,
  hasCustomer,
  checkoutFlash,
}: {
  locale: AppLocale;
  configured: boolean;
  subscribed: boolean;
  trialEndsAt: string;
  periodEndsAt: string | null;
  foundingEligible: boolean;
  foundingLockedIn: boolean;
  currentPlan: PricingPlanId | null;
  currentInterval: BillingInterval | null;
  seatQuantity: number;
  occupancy: number;
  hasCustomer: boolean;
  checkoutFlash?: string;
}) {
  const t = useTranslations("settings");
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(
    startCheckoutAction,
    initial,
  );
  const [portalState, portalAction, portalPending] = useActionState(
    openBillingPortalAction,
    initial,
  );
  const [seatState, seatAction, seatPending] = useActionState(
    addLicensedSeatAction,
    initial,
  );
  const [interval, setInterval] = useState<BillingInterval>(
    currentInterval ?? "month",
  );

  const founding = foundingLockedIn || foundingEligible;
  const catalog =
    subscribed && currentPlan
      ? catalogFromLicensed(currentPlan, seatQuantity, founding)
      : catalogForOccupancy(occupancy, founding);
  const licensed = subscribed ? Math.max(seatQuantity, catalog.seatQuantity) : catalog.seatQuantity;
  const unused = Math.max(0, licensed - occupancy);
  const atSeatCap = subscribed && occupancy >= licensed;
  const pendingIntervalChange = subscribed && interval !== (currentInterval ?? "month");

  const errorKey = checkoutState.error || portalState.error || seatState.error;
  const error =
    errorKey &&
    ({
      invalid: t("errors.invalid"),
      forbidden: t("errors.forbidden"),
      not_configured: t("billingNotConfigured"),
      not_found: t("errors.notFound"),
      checkout_failed: t("billingCheckoutFailed"),
      update_failed: t("billingUpdateFailed"),
      generic: t("errors.generic"),
    }[errorKey] ??
      t("errors.generic"));

  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const trialDate = new Date(trialEndsAt).toLocaleDateString(locale, dateOpts);
  const renewDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(locale, dateOpts)
    : null;

  const price =
    interval === "year"
      ? formatCadYearly(annualTotal(catalog.monthlyCad), locale)
      : formatCadMonthly(catalog.monthlyCad, locale);

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">{t("billingNotConfigured")}</p>
    );
  }

  return (
    <div className="space-y-8">
      {checkoutFlash === "success" ? (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
          {t("billingCheckoutSuccess")}
        </p>
      ) : null}
      {checkoutFlash === "cancel" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t("billingCheckoutCancel")}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {catalog.plan === "team"
              ? t("billingPlanNameTeam")
              : t("billingPlanNameStandard")}
          </h2>
          <StatusPill
            label={
              subscribed
                ? t("billingStatusActive")
                : t("billingStatusTrial", { date: trialDate })
            }
            tone={subscribed ? "success" : "warning"}
          />
          {founding ? (
            <StatusPill label={t("billingFoundingBadge")} tone="action" />
          ) : null}
        </div>
        <p className="font-heading text-3xl font-semibold tracking-tight text-brand">
          {price}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("billingSeatUse", { used: occupancy, total: licensed })}
          {unused > 0 ? ` · ${t("billingSeatUnused", { count: unused })}` : null}
        </p>
        {subscribed && renewDate ? (
          <p className="text-sm text-muted-foreground">
            {t("billingRenews", { date: renewDate })}
          </p>
        ) : null}
      </div>

      <form action={checkoutAction} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="interval" value={interval} />
        <div>
          <p className="mb-2 text-sm font-medium text-brand">
            {t("billingInterval")}
          </p>
          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-canvas p-1"
            role="radiogroup"
            aria-label={t("billingInterval")}
          >
            <IntervalChoice
              selected={interval === "month"}
              onSelect={() => setInterval("month")}
              title={t("billingMonthly")}
              detail={formatCadMonthly(catalog.monthlyCad, locale)}
            />
            <IntervalChoice
              selected={interval === "year"}
              onSelect={() => setInterval("year")}
              title={t("billingYearly")}
              detail={`${formatCadYearly(annualTotal(catalog.monthlyCad), locale)} · ${t("billingYearlySave")}`}
            />
          </div>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {!subscribed || pendingIntervalChange ? (
          <Button type="submit" disabled={checkoutPending}>
            {checkoutPending
              ? t("billingWorking")
              : subscribed
                ? interval === "year"
                  ? t("billingSwitchYearly")
                  : t("billingSwitchMonthly")
                : t("billingSubscribe")}
          </Button>
        ) : null}
      </form>

      {atSeatCap ? (
        <form action={seatAction} className="space-y-2">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" disabled={seatPending}>
            {seatPending ? t("billingWorking") : t("billingAddSeat")}
          </Button>
        </form>
      ) : null}

      {hasCustomer ? (
        <form action={portalAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" disabled={portalPending}>
            {portalPending ? t("billingWorking") : t("billingManage")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function IntervalChoice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg px-3 py-2.5 text-left transition-colors",
        selected
          ? "bg-surface text-brand shadow-elevated"
          : "text-muted-foreground hover:text-brand",
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}
