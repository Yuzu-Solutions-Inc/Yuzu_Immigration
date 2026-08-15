"use client";

import { useTranslations } from "next-intl";

import { formatPriceCents } from "@/lib/booking/slots";
import type { CancelPolicyDisplay } from "@/lib/square/cancel-policy";
import {
  computeCancelRefundAmounts,
  normalizeSquareCancelRefundPolicy,
  resolveCancelRefundTier,
} from "@/lib/square/cancel-policy";

export function CancelPolicyNotice({
  policy,
  locale,
  currency,
  paidAmountCents,
  startsAt,
  namespace = "booking",
  className,
}: {
  policy: CancelPolicyDisplay | null | undefined;
  locale: string;
  currency?: string | null;
  /** When set (e.g. manage cancel), show estimated refund after fee. */
  paidAmountCents?: number | null;
  /** Appointment start — refines refund estimate to the current cancel tier. */
  startsAt?: string | null;
  namespace?: "booking" | "bookingManage";
  className?: string;
}) {
  const t = useTranslations(namespace);
  if (!policy) return null;

  const currencyCode = (currency || "CAD").toUpperCase();
  const lines: string[] = [];

  if (policy.hasFeeTier) {
    lines.push(
      t("cancelPolicyFreeDays", { days: policy.freeDaysBefore }),
    );
    lines.push(
      t("cancelPolicyFeeDays", {
        freeDays: policy.freeDaysBefore,
        feeDays: policy.feeDaysBefore,
      }),
    );
    if (policy.feeDaysBefore > 0) {
      lines.push(
        t("cancelPolicyNoCancelWithin", { days: policy.feeDaysBefore }),
      );
    }
  } else if (policy.freeDaysBefore > 0) {
    lines.push(
      t("cancelPolicyFreeDays", { days: policy.freeDaysBefore }),
    );
  } else if (policy.feeDaysBefore > 0) {
    lines.push(
      t("cancelPolicyMinDays", { days: policy.feeDaysBefore }),
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
  } else if (lines.length === 0 || policy.freeDaysBefore === 0) {
    lines.push(t("cancelPolicyFullRefund"));
  }

  if (
    policy.refundEnabled &&
    typeof paidAmountCents === "number" &&
    paidAmountCents > 0
  ) {
    const normalized = normalizeSquareCancelRefundPolicy({
      cancel_refund_enabled: policy.refundEnabled,
      cancel_free_days_before: policy.freeDaysBefore,
      cancel_min_days_before: policy.feeDaysBefore,
      cancel_refund_fee_type: policy.feeType,
      cancel_refund_fee_cents: policy.feeCents,
      cancel_refund_fee_percent: policy.feePercent,
    });
    const tier = startsAt
      ? resolveCancelRefundTier(normalized, startsAt)
      : policy.hasFee
        ? "fee"
        : "free";
    const { refundCents } = computeCancelRefundAmounts(
      paidAmountCents,
      normalized,
      startsAt ?? undefined,
    );
    if (tier !== "blocked") {
      lines.push(
        t("cancelPolicyRefundEstimate", {
          refund: formatPriceCents(refundCents, locale, currencyCode),
          paid: formatPriceCents(paidAmountCents, locale, currencyCode),
        }),
      );
    }
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
