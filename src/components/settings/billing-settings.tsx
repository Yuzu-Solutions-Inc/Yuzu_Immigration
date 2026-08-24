"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  addLicensedSeatAction,
  openBillingPortalAction,
  scheduleSeatReductionAction,
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
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import {
  catalogFromLicensed,
  MAX_SEAT_ADD,
  type BillingInterval,
} from "@/lib/billing/plans";
import type { OrgRole } from "@/lib/auth/rbac";
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
  pendingSeatQuantity,
  pendingInterval,
  members,
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
  pendingSeatQuantity: number | null;
  pendingInterval: BillingInterval | null;
  members: Array<{
    id: string;
    role: OrgRole;
    is_licensed: boolean;
    licensed_at_renewal: boolean | null;
    profile: { full_name: string | null; email: string | null };
  }>;
  hasCustomer: boolean;
  checkoutFlash?: string;
}) {
  const t = useTranslations("settings");
  const tRoles = useTranslations("orgRoles");
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
  const [reduceState, reduceAction, reducePending] = useActionState(
    scheduleSeatReductionAction,
    initial,
  );
  const [interval, setInterval] = useState<BillingInterval>(
    pendingInterval ?? currentInterval ?? "month",
  );
  const [addCount, setAddCount] = useState(1);
  const [removeCount, setRemoveCount] = useState(1);

  const founding = foundingLockedIn || foundingEligible;
  const catalog = catalogFromLicensed(
    currentPlan ?? "standard",
    seatQuantity,
    founding,
  );
  const licensed = Math.max(seatQuantity, catalog.seatQuantity);
  const nextSeats = pendingSeatQuantity ?? licensed;
  const nextInterval = pendingInterval ?? currentInterval ?? "month";
  const pendingIntervalChange =
    subscribed && interval !== nextInterval;
  const renewalCatalog = catalogFromLicensed(
    "standard",
    nextSeats,
    founding,
  );
  const addCatalog = catalogFromLicensed(
    "standard",
    licensed + addCount,
    founding,
  );
  const showRenewalShift =
    subscribed &&
    (nextSeats !== licensed ||
      nextInterval !== (currentInterval ?? "month"));

  const errorMessage = (errorKey?: string) =>
    errorKey
      ? ({
          invalid: t("errors.invalid"),
          forbidden: t("errors.forbidden"),
          not_configured: t("billingNotConfigured"),
          not_found: t("errors.notFound"),
          checkout_failed: t("billingCheckoutFailed"),
          update_failed: t("billingUpdateFailed"),
          too_many_licensed: t("billingTooManyLicensed"),
          license_roster_failed: t("billingLicenseRosterFailed"),
          generic: t("errors.generic"),
        }[errorKey] ?? t("errors.generic"))
      : undefined;
  const checkoutError = errorMessage(checkoutState.error);
  const portalError = errorMessage(portalState.error);
  const seatError = errorMessage(seatState.error);
  const reduceError = errorMessage(reduceState.error);

  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const trialDate = new Date(trialEndsAt).toLocaleDateString(locale, dateOpts);
  const renewDate = periodEndsAt
    ? new Date(periodEndsAt).toLocaleDateString(locale, dateOpts)
    : null;

  const price = formatCatalogPrice(
    catalog.monthlyCad,
    currentInterval ?? "month",
    locale,
  );
  const addPrice = formatCatalogPrice(
    addCatalog.monthlyCad,
    currentInterval ?? "month",
    locale,
  );

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
            {t("billingPlanName")}
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
          {t("billingCurrentSeats", { count: licensed })}
        </p>
        {subscribed && renewDate ? (
          <p className="text-sm text-muted-foreground">
            {showRenewalShift
              ? t("billingTrueUpRenews", {
                  date: renewDate,
                  seats: renewalCatalog.seatQuantity,
                  price: formatCatalogPrice(
                    renewalCatalog.monthlyCad,
                    nextInterval,
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
        {checkoutError ? <FieldError>{checkoutError}</FieldError> : null}
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
              {t("billingAddSeatsHint", {
                count: addCount,
                price: addPrice,
              })}
            </FieldHint>
            {seatError ? (
              <FieldError className="sm:col-span-2">{seatError}</FieldError>
            ) : null}
          </form>

          {nextSeats > 1 ? (
            <form
              action={reduceAction}
              className="space-y-3 rounded-xl border border-border bg-canvas px-4 py-3"
            >
              <input type="hidden" name="locale" value={locale} />
              <div className="grid gap-3 sm:grid-cols-[8rem_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="seatRemoveQuantity">
                    {t("billingRemoveSeats")}
                  </FieldLabel>
                  <NativeSelect
                    id="seatRemoveQuantity"
                    name="quantity"
                    value={String(removeCount)}
                    onChange={(event) =>
                      setRemoveCount(Number(event.currentTarget.value) || 1)
                    }
                  >
                    {ADD_QUANTITIES.filter((n) => n < nextSeats).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Button type="submit" variant="outline" disabled={reducePending}>
                  {reducePending
                    ? t("billingWorking")
                    : t("billingRemoveSeatsSubmit")}
                </Button>
              </div>
              <FieldHint>
                {t("billingRemoveSeatsHint", {
                  seats: Math.max(1, nextSeats - removeCount),
                  date: renewDate ?? "",
                })}
              </FieldHint>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-brand">
                  {t("billingRenewalRoster")}
                </legend>
                {members.map((member) => {
                  const checked =
                    member.licensed_at_renewal ?? member.is_licensed;
                  const owner = member.role === "owner";
                  const name =
                    member.profile.full_name ??
                    member.profile.email ??
                    member.id;
                  return (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 text-sm text-brand"
                    >
                      {owner ? (
                        <input
                          type="hidden"
                          name="licensedMemberIds"
                          value={member.id}
                        />
                      ) : null}
                      <input
                        type="checkbox"
                        name="licensedMemberIds"
                        value={member.id}
                        defaultChecked={checked}
                        disabled={owner}
                        className="size-4 rounded border-input"
                      />
                      <span>
                        {name} · {tRoles(member.role)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {reduceError ? <FieldError>{reduceError}</FieldError> : null}
            </form>
          ) : null}
        </div>
      ) : null}

      {hasCustomer ? (
        <form action={portalAction} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="outline" disabled={portalPending}>
            {portalPending ? t("billingWorking") : t("billingManage")}
          </Button>
          {portalError ? <FieldError>{portalError}</FieldError> : null}
        </form>
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
