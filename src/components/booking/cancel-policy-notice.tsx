"use client";

import { useTranslations } from "next-intl";

import { formatPriceCents } from "@/lib/booking/slots";
import type { CancelPolicyDisplay } from "@/lib/square/cancel-policy";

export function CancelPolicyNotice({
  policy,
  locale,
  currency,
  paidAmountCents,
  namespace = "booking",
  className,
}: {
  policy: CancelPolicyDisplay | null | undefined;
  locale: string;
  currency?: string | null;
  /** When set (e.g. manage cancel), show estimated refund after fee. */
  paidAmountCents?: number | null;
  namespace?: "booking" | "bookingManage";
  className?: string;
}) {
  const t = useTranslations(namespace);
  if (!policy) return null;

  const currencyCode = (currency || "CAD").toUpperCase();
  const lines: string[] = [];

  if (policy.minDaysBefore > 0) {
    lines.push(
      t("cancelPolicyMinDays", { days: policy.minDaysBefore }),
    );
  }

  if (!policy.refundEnabled) {
    lines.push(t("cancelPolicyNoRefund"));
  } else if (policy.hasFee) {
    if (policy.feeType === "fixed") {
      lines.push(
        t("cancelPolicyFeeFixed", {
          fee: formatPriceCents(policy.feeCents, locale, currencyCode),
        }),
      );
    } else if (policy.feeType === "percent") {
      lines.push(
        t("cancelPolicyFeePercent", { percent: policy.feePercent }),
      );
    }
  } else {
    lines.push(t("cancelPolicyFullRefund"));
  }

  if (
    policy.refundEnabled &&
    typeof paidAmountCents === "number" &&
    paidAmountCents > 0
  ) {
    let feeCents = 0;
    if (policy.feeType === "fixed") feeCents = policy.feeCents;
    else if (policy.feeType === "percent") {
      feeCents = Math.round((paidAmountCents * policy.feePercent) / 100);
    }
    feeCents = Math.max(0, Math.min(paidAmountCents, feeCents));
    const refundCents = Math.max(0, paidAmountCents - feeCents);
    lines.push(
      t("cancelPolicyRefundEstimate", {
        refund: formatPriceCents(refundCents, locale, currencyCode),
        paid: formatPriceCents(paidAmountCents, locale, currencyCode),
      }),
    );
  }

  if (lines.length === 0) return null;

  return (
    <div
      className={
        className ??
        "rounded-xl border border-border bg-canvas px-3 py-2 text-xs text-muted-foreground"
      }
    >
      <p className="font-medium text-brand">{t("cancelPolicyTitle")}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
