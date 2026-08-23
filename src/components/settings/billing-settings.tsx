"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  openBillingPortalAction,
  startCheckoutAction,
  type BillingActionState,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  extraSeatsNeeded,
  includedSeats,
  planMonthlyCad,
  type BillingInterval,
} from "@/lib/billing/plans";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  formatCadMonthly,
  formatCadYearly,
  type PricingPlanId,
} from "@/lib/marketing/pricing";

const initial: BillingActionState = {};

export function BillingSettingsForm({
  locale,
  configured,
  subscribed,
  trialEndsAt,
  foundingEligible,
  foundingLockedIn,
  currentPlan,
  currentInterval,
  seatQuantity,
  memberCount,
  hasCustomer,
  checkoutFlash,
}: {
  locale: AppLocale;
  configured: boolean;
  subscribed: boolean;
  trialEndsAt: string;
  foundingEligible: boolean;
  foundingLockedIn: boolean;
  currentPlan: PricingPlanId | null;
  currentInterval: BillingInterval | null;
  seatQuantity: number;
  memberCount: number;
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

  const founding = foundingLockedIn || foundingEligible;
  const defaultPlan = currentPlan ?? "standard";
  const defaultInterval = currentInterval ?? "month";
  const defaultExtra = extraSeatsNeeded(defaultPlan, memberCount);

  const errorKey = checkoutState.error || portalState.error;
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

  const trialDate = new Date(trialEndsAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">{t("billingNotConfigured")}</p>
    );
  }

  return (
    <div className="space-y-6">
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

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("billingStatus")}
          </dt>
          <dd className="text-brand">
            {subscribed
              ? t("billingStatusActive")
              : t("billingStatusTrial", { date: trialDate })}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("billingSeats")}
          </dt>
          <dd className="text-brand">
            {t("billingSeatUse", {
              used: memberCount,
              total: subscribed ? seatQuantity : includedSeats(defaultPlan),
            })}
          </dd>
        </div>
        {founding ? (
          <div className="sm:col-span-2">
            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
              {t("billingFounding")}
            </dt>
            <dd className="text-brand">{t("billingFoundingHelp")}</dd>
          </div>
        ) : null}
      </dl>

      <FormStack action={checkoutAction} gap="loose">
        <input type="hidden" name="locale" value={locale} />
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="plan" required>
              {t("billingPlan")}
            </FieldLabel>
            <NativeSelect
              id="plan"
              name="plan"
              defaultValue={defaultPlan}
            >
              <option value="standard">
                {t("billingPlanStandard", {
                  price: formatCadMonthly(
                    planMonthlyCad("standard", founding),
                    locale,
                  ),
                })}
              </option>
              <option value="team">
                {t("billingPlanTeam", {
                  price: formatCadMonthly(
                    planMonthlyCad("team", founding),
                    locale,
                  ),
                })}
              </option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="interval" required>
              {t("billingInterval")}
            </FieldLabel>
            <NativeSelect
              id="interval"
              name="interval"
              defaultValue={defaultInterval}
            >
              <option value="month">{t("billingMonthly")}</option>
              <option value="year">
                {t("billingYearly", {
                  standard: formatCadYearly(
                    annualTotal(planMonthlyCad("standard", founding)),
                    locale,
                  ),
                })}
              </option>
            </NativeSelect>
            <FieldHint>{t("billingYearlyHelp")}</FieldHint>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="extraSeats">
              {t("billingExtraSeats")}
            </FieldLabel>
            <Input
              id="extraSeats"
              name="extraSeats"
              type="number"
              min={0}
              max={200}
              defaultValue={defaultExtra}
            />
            <FieldHint>{t("billingExtraSeatsHelp")}</FieldHint>
          </Field>
        </FieldGrid>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={checkoutPending}>
          {checkoutPending
            ? t("billingWorking")
            : subscribed
              ? t("billingUpdate")
              : t("billingSubscribe")}
        </Button>
      </FormStack>

      {hasCustomer ? (
        <form action={portalAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button
            type="submit"
            variant="outline"
            disabled={portalPending}
          >
            {portalPending ? t("billingWorking") : t("billingManage")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
