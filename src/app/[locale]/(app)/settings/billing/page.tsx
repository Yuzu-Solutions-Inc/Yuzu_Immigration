import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { BillingSettingsForm } from "@/components/settings/billing-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import type { BillingInterval } from "@/lib/billing/plans";
import { listOrgMembers, listPendingInvitations } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import type { PricingPlanId } from "@/lib/marketing/pricing";
import { getStripe, stripeConfigured } from "@/lib/stripe/client";
import { occupancyCount } from "@/lib/stripe/seats";
import {
  foundingCohortOpen,
  loadOrgBilling,
  periodEndIso,
  reconcileOrgBilling,
} from "@/lib/stripe/sync";

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

  const [occupancy, billing, foundingEligible, members, invitations, user] =
    await Promise.all([
      occupancyCount(orgId),
      loadOrgBilling(orgId),
      foundingCohortOpen(orgId),
      listOrgMembers(),
      listPendingInvitations(),
      getSessionUser(),
    ]);

  let periodEndsAt: string | null = null;
  if (billing?.stripe_subscription_id && stripeConfigured()) {
    try {
      const subscription = await getStripe().subscriptions.retrieve(
        billing.stripe_subscription_id,
      );
      periodEndsAt = periodEndIso(subscription);
    } catch (error) {
      console.error("billing period:", error);
    }
  }

  const plan =
    billing?.billing_plan === "team" || billing?.billing_plan === "standard"
      ? (billing.billing_plan as PricingPlanId)
      : null;
  const interval =
    billing?.billing_interval === "year" || billing?.billing_interval === "month"
      ? (billing.billing_interval as BillingInterval)
      : null;

  const t = await getTranslations("settings");

  return (
    <div className="space-y-4">
      <SurfaceCard className="sm:p-6">
        <BillingSettingsForm
          locale={locale}
          configured={stripeConfigured()}
          subscribed={Boolean(billing?.subscribed_at)}
          trialEndsAt={membership.organization.trialEndsAt.toISOString()}
          periodEndsAt={periodEndsAt}
          foundingEligible={foundingEligible}
          foundingLockedIn={Boolean(billing?.founding_rate)}
          currentPlan={plan}
          currentInterval={interval}
          seatQuantity={billing?.billing_seat_quantity ?? 1}
          occupancy={occupancy}
          hasCustomer={Boolean(billing?.stripe_customer_id)}
          seatTrueUp={Boolean(billing?.billing_seat_true_up)}
          checkoutFlash={query.checkout}
        />
      </SurfaceCard>
      <SurfaceCard className="space-y-4 sm:p-6">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("team")}
        </h2>
        <TeamSettings
          locale={locale}
          currentUserId={user?.id ?? ""}
          currentUserRole={membership.role}
          members={members}
          invitations={invitations}
          subscribed={membership.organization.subscribed}
          licensedSeats={billing?.billing_seat_quantity ?? 1}
          founding={Boolean(billing?.founding_rate) || foundingEligible}
          currentPlan={plan}
          currentInterval={interval}
        />
      </SurfaceCard>
    </div>
  );
}
