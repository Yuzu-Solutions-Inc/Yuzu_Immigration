import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { syncStripeConnectReturnAction, resumeStripeOnboardingAction } from "@/app/actions/stripe-connect";
import { SurfaceCard } from "@/components/layout/surface-card";
import { CancelPolicySettings } from "@/components/settings/cancel-policy-settings";
import { PaymentsSettingsSections } from "@/components/settings/payments-settings-sections";
import { SageSettings } from "@/components/settings/sage-settings";
import { SquareSettings } from "@/components/settings/square-settings";
import { StripeSettings } from "@/components/settings/stripe-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  getOrgSageConnection,
  parseSagePercent,
} from "@/lib/sage/client";
import { sageConfigured } from "@/lib/sage/oauth";
import {
  listSageSalesLedgerAccounts,
  listSageTaxRates,
} from "@/lib/sage/tax";
import { squareConfigured } from "@/lib/square/oauth";
import { stripeConfigured } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ square?: string; sage?: string; stripe?: string }>;
}) {
  const { locale: localeParam } = await params;
  const query = await searchParams;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);

  const membership = await getPrimaryMembership();
  if (!membership) redirect(`/${locale}/onboarding`);
  if (!canAdministerOrg(membership.role)) {
    redirect(`/${locale}/settings/account`);
  }

  if (query.stripe === "refresh") {
    await resumeStripeOnboardingAction(locale);
  }
  if (query.stripe === "return") {
    await syncStripeConnectReturnAction(locale);
  }

  const orgId = membership.organization.id;
  const supabase = await createClient();
  const [{ data: square }, { data: stripe }, sageConnection, { data: mappings }] =
    await Promise.all([
      supabase
        .from("square_connections")
        .select(
          "business_name, merchant_id, currency, is_enabled, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent",
        )
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("stripe_connections")
        .select(
          "business_name, stripe_account_id, currency, is_enabled, charges_ready, details_submitted, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent",
        )
        .eq("organization_id", orgId)
        .maybeSingle(),
      getOrgSageConnection(orgId),
      supabase
        .from("sage_tax_mappings")
        .select("country_code, region_code, sage_tax_rate_id")
        .eq("organization_id", orgId),
    ]);

  let ledgers: { id: string; label: string }[] = [];
  let taxRates: { id: string; label: string; percent?: number }[] = [];
  if (sageConnection) {
    try {
      const [ledgerRows, rateRows] = await Promise.all([
        listSageSalesLedgerAccounts(sageConnection),
        listSageTaxRates(sageConnection),
      ]);
      ledgers = ledgerRows.map((row) => ({
        id: row.id as string,
        label:
          row.displayed_as ||
          [row.nominal_code, row.displayed_as].filter(Boolean).join(" ") ||
          (row.id as string),
      }));
      taxRates = rateRows.map((row) => ({
        id: row.id as string,
        label: row.displayed_as || row.name || (row.id as string),
        percent: parseSagePercent(row.percentage) ?? undefined,
      }));
    } catch (error) {
      console.error("payments settings sage catalogs:", error);
    }
  }

  const t = await getTranslations("settings");
  const squareFlash = query.square;
  const sageFlash = query.sage;
  const stripeFlash = query.stripe;
  const squareEnabled = Boolean(square?.is_enabled);
  const stripeEnabled = Boolean(stripe?.is_enabled);
  const policyValues = stripeEnabled ? stripe : squareEnabled ? square : null;

  return (
    <div className="space-y-4" data-tour="nav-payments">
      {squareFlash === "connected" ? (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
          {t("squareConnectedFlash")}
        </p>
      ) : null}
      {squareFlash && squareFlash !== "connected" ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`squareErrors.${squareFlash}`, {
            defaultValue: t("squareErrors.save_failed"),
          })}
        </p>
      ) : null}
      {stripeFlash === "connected" ? (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
          {t("stripeConnectedFlash")}
        </p>
      ) : null}
      {stripeFlash === "continue" ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text">
          {t("stripeContinueOnboarding")}
        </p>
      ) : null}
      {stripeFlash &&
      stripeFlash !== "connected" &&
      stripeFlash !== "return" &&
      stripeFlash !== "refresh" &&
      stripeFlash !== "continue" ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`stripeErrors.${stripeFlash}`, {
            defaultValue: t("stripeErrors.save_failed"),
          })}
        </p>
      ) : null}
      {sageFlash === "connected" ? (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success-text">
          {t("sageConnectedFlash")}
        </p>
      ) : null}
      {sageFlash && sageFlash !== "connected" ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`sageErrors.${sageFlash}`, {
            defaultValue: t("sageErrors.save_failed"),
          })}
        </p>
      ) : null}
      <PaymentsSettingsSections
        defaultValue={sageFlash ? "sage" : "processors"}
        processors={
          <SurfaceCard className="space-y-8 sm:p-6">
            <p className="text-sm text-muted-foreground">
              {t("processorExclusiveHelp")}
            </p>
            <SquareSettings
              locale={locale}
              configured={squareConfigured()}
              connection={square}
              otherProcessorConnected={stripeEnabled}
            />
            <StripeSettings
              locale={locale}
              configured={stripeConfigured()}
              connection={stripe}
              otherProcessorConnected={squareEnabled}
            />
            {policyValues ? (
              <CancelPolicySettings locale={locale} values={policyValues} />
            ) : null}
          </SurfaceCard>
        }
        sage={
          <SurfaceCard className="sm:p-6">
            <SageSettings
              locale={locale}
              configured={sageConfigured()}
              connection={sageConnection}
              ledgers={ledgers}
              taxRates={taxRates}
              mappings={mappings ?? []}
            />
          </SurfaceCard>
        }
      />
    </div>
  );
}
