import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/booking/slots";
import { toAppLocale } from "@/lib/i18n/locales";
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
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", payment.organization_id)
    .maybeSingle();

  const expired =
    payment.expires_at && Date.parse(payment.expires_at) < Date.now();
  const isPaid = payment.status === "paid";
  const isPending = payment.status === "pending" && !expired;

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
        <p className="font-heading text-3xl font-semibold text-brand">
          {formatPriceCents(payment.amount_cents, locale, payment.currency)}
        </p>
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

      {isPending && payment.checkout_url ? (
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
