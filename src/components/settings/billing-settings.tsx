"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  addLicensedSeatAction,
  openBillingPortalAction,
  setSeatTrueUpAction,
  startCheckoutAction,
  type BillingActionState,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import {
  catalogForOccupancy,
  catalogFromLicensed,
  MAX_SEAT_ADD,
  renewalSeatTarget,
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

const ADD_QUANTITIES = Array.from({ length: MAX_SEAT_ADD }, (_, i) => i + 1);

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
  seatTrueUp,
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
  seatTrueUp: boolean;
  hasCustomer: boolean;
  checkoutFlash?: string;
}) {
  const t = useTranslations("settings");
  const trueUpFormRef = useRef<HTMLFormElement>(null);
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
  const [trueUpState, trueUpAction, trueUpPending] = useActionState(
    setSeatTrueUpAction,
    initial,
  );
  const [interval, setInterval] = useState<BillingInterval>(
    currentInterval ?? "month",
  );
  const [addCount, setAddCount] = useState(1);

  const founding = foundingLockedIn || foundingEligible;
  const catalog =
    subscribed && currentPlan
      ? catalogFromLicensed(currentPlan, seatQuantity, founding)
      : catalogForOccupancy(occupancy, founding);
  const licensed = subscribed
    ? Math.max(seatQuantity, catalog.seatQuantity)
    : catalog.seatQuantity;
  const unused = Math.max(0, licensed - occupancy);
  const pendingIntervalChange =
    subscribed && interval !== (currentInterval ?? "month");
  const renewalCatalog = catalogForOccupancy(
    renewalSeatTarget({ licensed, occupancy, trueUp: seatTrueUp }),
    founding,
  );
  const addCatalog = catalogForOccupancy(
    Math.max(occupancy, licensed) + addCount,
    founding,
  );
  const showRenewalShift =
    subscribed &&
    seatTrueUp &&
    unused > 0 &&
    !catalogsEqual(catalog, renewalCatalog);

  const errorKey =
    checkoutState.error ||
    portalState.error ||
    seatState.error ||
    trueUpState.error;
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

  const price = formatCatalogPrice(catalog.monthlyCad, interval, locale);
  const addPrice = formatCatalogPrice(addCatalog.monthlyCad, interval, locale);

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
      {error ? <FieldError>{error}</FieldError> : null}

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
        <p className="text-sm text-muted-foreground">{t("billingHelp")}</p>
        <p className="font-heading text-3xl font-semibold tracking-tight text-brand">
          {price}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("billingSeatUse", { used: occupancy, total: licensed })}
          {unused > 0 ? ` · ${t("billingSeatUnused", { count: unused })}` : null}
        </p>
        {subscribed && renewDate ? (
          <p className="text-sm text-muted-foreground">
            {showRenewalShift
              ? t("billingTrueUpRenews", {
                  date: renewDate,
                  seats: renewalCatalog.seatQuantity,
                  price: formatCatalogPrice(
                    renewalCatalog.monthlyCad,
                    interval,
                    locale,
                  ),
                })
              : t("billingRenews", { date: renewDate })}
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

      {subscribed ? (
        <div className="space-y-4">
          <form
            action={seatAction}
            className="grid gap-3 sm:grid-cols-[8rem_auto] sm:items-end"
          >
            <input type="hidden" name="locale" value={locale} />
            <Field>
              <FieldLabel htmlFor="seatAddQuantity">
                {t("billingAddSeats")}
              </FieldLabel>
              <NativeSelect
                id="seatAddQuantity"
                name="quantity"
                value={String(addCount)}
                onChange={(event) =>
                  setAddCount(Number(event.currentTarget.value) || 1)
                }
              >
                {ADD_QUANTITIES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" variant="outline" disabled={seatPending}>
              {seatPending ? t("billingWorking") : t("billingAddSeatsSubmit")}
            </Button>
            <FieldHint className="sm:col-span-2">
              {addCatalog.plan !== catalog.plan
                ? t("billingAddSeatsPlanHint", {
                    count: addCount,
                    plan:
                      addCatalog.plan === "team"
                        ? t("billingPlanNameTeam")
                        : t("billingPlanNameStandard"),
                    price: addPrice,
                  })
                : t("billingAddSeatsHint", {
                    count: addCount,
                    price: addPrice,
                  })}
            </FieldHint>
          </form>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-canvas px-4 py-3">
            <form ref={trueUpFormRef} action={trueUpAction}>
              <input type="hidden" name="locale" value={locale} />
              <input
                type="hidden"
                name="enabled"
                value={seatTrueUp ? "false" : "true"}
              />
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="seatTrueUp">{t("billingSeatTrueUp")}</Label>
                <FieldHint>
                  {seatTrueUp
                    ? unused > 0 && renewDate
                      ? t("billingSeatTrueUpOnUnused", {
                          count: unused,
                          date: renewDate,
                          seats: renewalCatalog.seatQuantity,
                        })
                      : t("billingSeatTrueUpOn")
                    : t("billingSeatTrueUpOff")}
                </FieldHint>
              </div>
            </form>
            <Switch
              id="seatTrueUp"
              checked={seatTrueUp}
              disabled={trueUpPending}
              onCheckedChange={() => trueUpFormRef.current?.requestSubmit()}
            />
          </div>
        </div>
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

function catalogsEqual(
  a: { plan: PricingPlanId; extraSeats: number; seatQuantity: number },
  b: { plan: PricingPlanId; extraSeats: number; seatQuantity: number },
) {
  return (
    a.plan === b.plan &&
    a.extraSeats === b.extraSeats &&
    a.seatQuantity === b.seatQuantity
  );
}

function formatCatalogPrice(
  monthlyCad: number,
  interval: BillingInterval,
  locale: AppLocale,
) {
  return interval === "year"
    ? formatCadYearly(annualTotal(monthlyCad), locale)
    : formatCadMonthly(monthlyCad, locale);
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
