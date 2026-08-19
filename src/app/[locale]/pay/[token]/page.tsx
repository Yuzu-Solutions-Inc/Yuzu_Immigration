import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PublicPayCheckout } from "@/components/pay/public-pay-checkout";
import { buttonVariants } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/booking/slots";
import { toAppLocale } from "@/lib/i18n/locales";
import { getOrgSageConnection } from "@/lib/sage/client";
import { personTaxAddress } from "@/lib/sage/checkout";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadPaymentByToken } from "@/lib/square/payments";
import { cn } from "@/lib/utils";

export default async function PublicPayPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale: localeParam, token } = await params;
  setRequestLocale(localeParam);
  const locale = toAppLocale(localeParam);
  const t = await getTranslations("publicPay");

  const payment = await loadPaymentByToken(token);
  if (!payment) {
    return (
      <main className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
        <BrandLogo size="sm" href="/" />
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("unavailableTitle")}
        </h1>
        <p className="text-muted-foreground">{t("unavailableBody")}</p>
      </main>
    );
  }

  const admin = createServiceClient();
  const [{ data: org }, sage] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", payment.organization_id)
      .maybeSingle(),
    getOrgSageConnection(payment.organization_id),
  ]);

  const expired =
    payment.expires_at && Date.parse(payment.expires_at) < Date.now();
  const isPaid = payment.status === "paid";
  const isPending = payment.status === "pending" && !expired;
  const taxCents = payment.tax_cents ?? 0;
  const totalCents = payment.amount_cents + taxCents;
  const showTax = taxCents > 0 || Boolean(payment.tax_label);

  let needsAddress = false;
  if (isPending && sage && payment.person_id) {
    const address = await personTaxAddress({
      organizationId: payment.organization_id,
      personId: payment.person_id,
    });
    needsAddress = !address?.hasAddress;
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-12">
      <div className="text-center">
        <BrandLogo size="sm" href="/" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">
          {(org?.name as string | null) ?? t("firmFallback")}
        </p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {isPaid ? t("paidTitle") : t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{payment.description}</p>
        {showTax ? (
          <dl className="mx-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>{t("subtotal")}</dt>
              <dd>
                {formatPriceCents(
                  payment.amount_cents,
                  locale,
                  payment.currency,
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>
                {payment.tax_label || t("tax")}
                {payment.tax_percent
                  ? ` (${Number(payment.tax_percent)}%)`
                  : ""}
              </dt>
              <dd>
                {formatPriceCents(taxCents, locale, payment.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 font-heading text-xl font-semibold text-brand">
              <dt>{t("total")}</dt>
              <dd>
                {formatPriceCents(totalCents, locale, payment.currency)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="font-heading text-3xl font-semibold text-brand">
            {formatPriceCents(payment.amount_cents, locale, payment.currency)}
          </p>
        )}
      </div>

      {isPaid ? (
        <p className="rounded-xl border border-border bg-canvas px-4 py-3 text-center text-sm text-muted-foreground">
          {t("paidBody")}
        </p>
      ) : null}

      {expired && !isPaid ? (
        <p className="rounded-xl border border-border bg-canvas px-4 py-3 text-center text-sm text-muted-foreground">
          {t("expiredBody")}
        </p>
      ) : null}

      {isPending && sage ? (
        <PublicPayCheckout
          locale={locale}
          token={token}
          needsAddress={needsAddress}
          checkoutUrl={needsAddress ? null : payment.checkout_url}
        />
      ) : null}

      {isPending && !sage && payment.checkout_url ? (
        <div className="flex justify-center">
          <a
            href={payment.checkout_url}
            className={cn(
              buttonVariants(),
              "bg-action text-action-foreground hover:bg-action/90",
            )}
          >
            {t("payWithSquare")}
          </a>
        </div>
      ) : null}

      {!isPaid && !isPending && !expired ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("unavailableBody")}
        </p>
      ) : null}
    </main>
  );
}
