"use client";

import { useActionState, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  cancelSubscriptionAction,
  openBillingPortalAction,
  resumeSubscriptionAction,
  startCheckoutAction,
  updateLicensedSeatsAction,
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
import { StatusPill } from "@/components/ui/status-pill";
import {
  catalogFromLicensed,
  MAX_SEAT_ADD,
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
  writable,
  trialEndsAt,
  periodEndsAt,
  cancelAtPeriodEnd,
  foundingEligible,
  foundingLockedIn,
  currentPlan,
  currentInterval,
  seatQuantity,
  pendingSeatQuantity,
  pendingInterval,
  usedSeats,
  hasCustomer,
  checkoutFlash,
}: {
  locale: AppLocale;
  configured: boolean;
  subscribed: boolean;
  writable: boolean;
  trialEndsAt: string;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  foundingEligible: boolean;
  foundingLockedIn: boolean;
  currentPlan: PricingPlanId | null;
  currentInterval: BillingInterval | null;
  seatQuantity: number;
  pendingSeatQuantity: number | null;
  pendingInterval: BillingInterval | null;
  usedSeats: number;
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
    updateLicensedSeatsAction,
    initial,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelSubscriptionAction,
    initial,
  );
  const [resumeState, resumeAction, resumePending] = useActionState(
    resumeSubscriptionAction,
    initial,
  );
  const [interval, setInterval] = useState<BillingInterval>(
    pendingInterval ?? currentInterval ?? "month",
  );
  const founding = foundingLockedIn || foundingEligible;
  const licensed = Math.max(1, seatQuantity);
  const nextSeats = pendingSeatQuantity ?? licensed;
  const occupancy = Math.max(1, usedSeats);
  const minSeats = Math.max(1, Math.min(occupancy, nextSeats));
  const maxSeats = licensed + MAX_SEAT_ADD;
  const [draftSeats, setDraftSeats] = useState(nextSeats);
  const currentCatalog = catalogFromLicensed(
    currentPlan ?? "standard",
    licensed,
    founding,
  );
  const nextCatalog = catalogFromLicensed("standard", draftSeats, founding);
  const nextInterval = pendingInterval ?? currentInterval ?? "month";
  const pendingIntervalChange = subscribed && interval !== nextInterval;
  const seatsDirty = subscribed && draftSeats !== nextSeats;
  const unused = Math.max(0, licensed - occupancy);

  const errorMessage = (errorKey?: string) =>
    errorKey
      ? ({
          invalid: t("errors.invalid"),
          forbidden: t("errors.forbidden"),
          not_configured: t("billingNotConfigured"),
          not_found: t("errors.notFound"),
          checkout_failed: t("billingCheckoutFailed"),
          update_failed: t("billingUpdateFailed"),
          cancel_failed: t("billingCancelFailed"),
          resume_failed: t("billingResumeFailed"),
          seats_in_use: t("billingSeatsInUse"),
          generic: t("errors.generic"),
        }[errorKey] ?? t("errors.generic"))
      : undefined;

  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const trialDate = new Date(trialEndsAt).toLocaleDateString(locale, dateOpts);
  const renewDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(locale, dateOpts)
    : null;

  function setSeats(value: number) {
    if (!Number.isFinite(value)) return;
    setDraftSeats(Math.min(maxSeats, Math.max(minSeats, Math.trunc(value))));
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">{t("billingNotConfigured")}</p>
    );
  }

  const statusLabel = subscribed
    ? cancelAtPeriodEnd && renewDate
      ? t("billingStatusCanceling", { date: renewDate })
      : t("billingStatusActive")
    : writable
      ? t("billingStatusTrial", { date: trialDate })
      : t("billingStatusLocked");
  const statusTone = subscribed
    ? cancelAtPeriodEnd
      ? "warning"
      : "success"
    : writable
      ? "warning"
      : "destructive";

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

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("billingPlanName")}
        </h2>
        <StatusPill label={statusLabel} tone={statusTone} />
        {founding ? (
          <StatusPill label={t("billingFoundingBadge")} tone="action" />
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{t("billingHelp")}</p>
      {!subscribed && !writable ? (
        <p className="text-sm text-muted-foreground">{t("billingLockedHelp")}</p>
      ) : null}

      <FieldGrid columns={subscribed && !cancelAtPeriodEnd ? 2 : 1}>
        <section className="space-y-2 rounded-xl border border-border bg-canvas px-4 py-3">
          <h3 className="text-sm font-semibold text-brand">
            {t("billingCurrentTitle")}
          </h3>
          <p className="font-heading text-2xl font-semibold tracking-tight text-brand">
            {formatCatalogPrice(
              currentCatalog.monthlyCad,
              currentInterval ?? "month",
              locale,
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("billingCurrentSeats", { count: licensed })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("billingSeatUse", { used: occupancy, total: licensed })}
          </p>
          {subscribed && renewDate ? (
            <p className="text-sm text-muted-foreground">
              {cancelAtPeriodEnd
                ? t("billingEnds", { date: renewDate })
                : t("billingRenews", { date: renewDate })}
            </p>
          ) : null}
        </section>

        {subscribed && !cancelAtPeriodEnd ? (
          <section className="space-y-2 rounded-xl border border-border bg-canvas px-4 py-3">
            <h3 className="text-sm font-semibold text-brand">
              {t("billingNextTitle")}
            </h3>
            <p className="font-heading text-2xl font-semibold tracking-tight text-brand">
              {formatCatalogPrice(nextCatalog.monthlyCad, interval, locale)}
            </p>
            {renewDate ? (
              <p className="text-sm text-muted-foreground">
                {t("billingTrueUpRenews", {
                  date: renewDate,
                  seats: Math.min(maxSeats, Math.max(minSeats, draftSeats)),
                  price: formatCatalogPrice(
                    nextCatalog.monthlyCad,
                    interval,
                    locale,
                  ),
                })}
              </p>
            ) : null}
          </section>
        ) : null}
      </FieldGrid>

      {subscribed && !cancelAtPeriodEnd ? (
        <FormStack action={seatAction} gap="tight">
          <input type="hidden" name="locale" value={locale} />
          <Field>
            <FieldLabel htmlFor="seatQuantity">{t("billingSeatCount")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("billingSeatDecrease")}
                disabled={seatPending || draftSeats <= occupancy}
                onClick={() => setSeats(draftSeats - 1)}
              >
                <Minus />
              </Button>
              <Input
                id="seatQuantity"
                name="seatQuantity"
                type="number"
                inputMode="numeric"
                min={minSeats}
                max={maxSeats}
                step={1}
                value={draftSeats}
                onChange={(event) => {
                  if (event.currentTarget.value === "") {
                    setDraftSeats(minSeats);
                    return;
                  }
                  const next = Number(event.currentTarget.value);
                  if (Number.isFinite(next)) setDraftSeats(Math.trunc(next));
                }}
                onBlur={() => setSeats(draftSeats)}
                className="w-20 px-2 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("billingSeatIncrease")}
                disabled={seatPending || draftSeats >= maxSeats}
                onClick={() => setSeats(draftSeats + 1)}
              >
                <Plus />
              </Button>
            </div>
            <FieldHint>
              {unused > 0
                ? t("billingUnusedSeats", { unused, used: occupancy })
                : t("billingSeatsInUseHint")}
            </FieldHint>
          </Field>
          {seatsDirty ? (
            <Button
              type="submit"
              variant="outline"
              disabled={
                seatPending || draftSeats < minSeats || draftSeats > maxSeats
              }
            >
              {seatPending ? t("billingWorking") : t("billingSeatsSave")}
            </Button>
          ) : null}
          {errorMessage(seatState.error) ? (
            <FieldError>{errorMessage(seatState.error)}</FieldError>
          ) : null}
        </FormStack>
      ) : null}

      <FormStack action={checkoutAction} gap="tight">
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
              onSelect={() => {
                if (!cancelAtPeriodEnd) setInterval("month");
              }}
              title={t("billingMonthly")}
              detail={formatCadMonthly(nextCatalog.monthlyCad, locale)}
            />
            <IntervalChoice
              selected={interval === "year"}
              onSelect={() => {
                if (!cancelAtPeriodEnd) setInterval("year");
              }}
              title={t("billingYearly")}
              detail={`${formatCadYearly(annualTotal(nextCatalog.monthlyCad), locale)} · ${t("billingYearlySave")}`}
            />
          </div>
          <FieldHint className="mt-2">{t("billingYearlyHelp")}</FieldHint>
        </div>
        {!subscribed || (pendingIntervalChange && !cancelAtPeriodEnd) ? (
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
        {errorMessage(checkoutState.error) ? (
          <FieldError>{errorMessage(checkoutState.error)}</FieldError>
        ) : null}
      </FormStack>

      {hasCustomer ? (
        <FormStack action={portalAction} gap="tight">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" disabled={portalPending}>
            {portalPending ? t("billingWorking") : t("billingManage")}
          </Button>
          {errorMessage(portalState.error) ? (
            <FieldError>{errorMessage(portalState.error)}</FieldError>
          ) : null}
        </FormStack>
      ) : null}

      {subscribed && !cancelAtPeriodEnd ? (
        <FormStack
          action={cancelAction}
          gap="tight"
          onSubmit={(event) => {
            if (!window.confirm(t("billingUnsubscribeConfirm"))) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <FieldHint>{t("billingUnsubscribeHelp")}</FieldHint>
          <Button
            type="submit"
            variant="outline"
            disabled={cancelPending}
            className="text-destructive hover:text-destructive"
          >
            {cancelPending ? t("billingWorking") : t("billingUnsubscribe")}
          </Button>
          {errorMessage(cancelState.error) ? (
            <FieldError>{errorMessage(cancelState.error)}</FieldError>
          ) : null}
        </FormStack>
      ) : null}

      {subscribed && cancelAtPeriodEnd ? (
        <FormStack action={resumeAction} gap="tight">
          <input type="hidden" name="locale" value={locale} />
          <FieldHint>
            {renewDate
              ? t("billingResumeHelp", { date: renewDate })
              : t("billingUnsubscribeHelp")}
          </FieldHint>
          <Button type="submit" variant="outline" disabled={resumePending}>
            {resumePending ? t("billingWorking") : t("billingResume")}
          </Button>
          {errorMessage(resumeState.error) ? (
            <FieldError>{errorMessage(resumeState.error)}</FieldError>
          ) : null}
        </FormStack>
      ) : null}
    </div>
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
