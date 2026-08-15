import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { SquareSettings } from "@/components/settings/square-settings";
import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { toAppLocale } from "@/lib/i18n/locales";
import { squareConfigured } from "@/lib/square/oauth";
import { createClient } from "@/lib/supabase/server";

export default async function PaymentsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ square?: string }>;
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

  const supabase = await createClient();
  const { data: square } = await supabase
    .from("square_connections")
    .select(
      "business_name, merchant_id, currency, is_enabled, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent",
    )
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  const t = await getTranslations("settings");
  const squareFlash = query.square;

  return (
    <SurfaceCard className="space-y-4 sm:p-6">
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
      <SquareSettings
        locale={locale}
        configured={squareConfigured()}
        connection={square}
      />
    </SurfaceCard>
  );
}
