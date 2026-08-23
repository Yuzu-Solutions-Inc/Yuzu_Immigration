import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { BillingSettingsForm } from "@/components/settings/billing-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import type { BillingInterval } from "@/lib/billing/plans";
import { toAppLocale } from "@/lib/i18n/locales";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import { stripeConfigured } from "@/lib/stripe/client";
import {
  foundingCohortOpen,
  loadOrgBilling,
  reconcileOrgBilling,
} from "@/lib/stripe/sync";
import { createClient } from "@/lib/supabase/server";

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ checkout?: string }>;
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

  const orgId = membership.organization.id;
  if (query.checkout === "success" && stripeConfigured()) {
    try {
      await reconcileOrgBilling(orgId);
    } catch (error) {
      console.error("reconcile checkout:", error);
    }
  }

  const supabase = await createClient();
  const [{ count }, billing, foundingEligible] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    loadOrgBilling(orgId),
    foundingCohortOpen(orgId),
  ]);

  const t = await getTranslations("settings");
  const plan =
    billing?.billing_plan === "team" || billing?.billing_plan === "standard"
      ? (billing.billing_plan as PricingPlanId)
      : null;
  const interval =
    billing?.billing_interval === "year" || billing?.billing_interval === "month"
      ? (billing.billing_interval as BillingInterval)
      : null;

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("billing")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("billingHelp")}</p>
      </div>
      <BillingSettingsForm
        locale={locale}
        configured={stripeConfigured()}
        subscribed={Boolean(billing?.subscribed_at)}
        trialEndsAt={membership.organization.trialEndsAt.toISOString()}
        foundingEligible={foundingEligible}
        foundingLockedIn={Boolean(billing?.founding_rate)}
        currentPlan={plan}
        currentInterval={interval}
        seatQuantity={billing?.billing_seat_quantity ?? 1}
        memberCount={count ?? 1}
        hasCustomer={Boolean(billing?.stripe_customer_id)}
        checkoutFlash={query.checkout}
      />
    </SurfaceCard>
  );
}
