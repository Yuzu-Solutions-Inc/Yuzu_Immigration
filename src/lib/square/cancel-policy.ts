import { formatPriceCents } from "@/lib/booking/slots";

export type CancelRefundFeeType = "none" | "fixed" | "percent";

export type SquareCancelRefundPolicy = {
  cancelRefundEnabled: boolean;
  cancelMinDaysBefore: number;
  cancelRefundFeeType: CancelRefundFeeType;
  cancelRefundFeeCents: number;
  cancelRefundFeePercent: number;
};

export const DEFAULT_SQUARE_CANCEL_REFUND_POLICY: SquareCancelRefundPolicy = {
  cancelRefundEnabled: true,
  cancelMinDaysBefore: 0,
  cancelRefundFeeType: "none",
  cancelRefundFeeCents: 0,
  cancelRefundFeePercent: 0,
};

export function parseCancelRefundFeeType(
  value: unknown,
): CancelRefundFeeType {
  if (value === "fixed" || value === "percent" || value === "none") {
    return value;
  }
  return "none";
}

export function normalizeSquareCancelRefundPolicy(
  row: Partial<{
    cancel_refund_enabled: boolean | null;
    cancel_min_days_before: number | null;
    cancel_refund_fee_type: string | null;
    cancel_refund_fee_cents: number | null;
    cancel_refund_fee_percent: number | null;
  }> | null | undefined,
): SquareCancelRefundPolicy {
  if (!row) return { ...DEFAULT_SQUARE_CANCEL_REFUND_POLICY };
  const feeType = parseCancelRefundFeeType(row.cancel_refund_fee_type);
  return {
    cancelRefundEnabled: row.cancel_refund_enabled !== false,
    cancelMinDaysBefore: Math.max(
      0,
      Math.min(365, Math.trunc(Number(row.cancel_min_days_before) || 0)),
    ),
    cancelRefundFeeType: feeType,
    cancelRefundFeeCents: Math.max(
      0,
      Math.trunc(Number(row.cancel_refund_fee_cents) || 0),
    ),
    cancelRefundFeePercent: Math.max(
      0,
      Math.min(100, Math.trunc(Number(row.cancel_refund_fee_percent) || 0)),
    ),
  };
}

/** Guest may cancel only if start is at least `minDays` away (and still in the future). */
export function isWithinGuestCancelWindow(
  startsAt: string,
  minDaysBefore: number,
  nowMs = Date.now(),
): boolean {
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs) || startMs <= nowMs) return false;
  if (minDaysBefore <= 0) return true;
  return startMs - nowMs >= minDaysBefore * 86_400_000;
}

export function computeCancelRefundAmounts(
  amountCents: number,
  policy: SquareCancelRefundPolicy,
): { feeCents: number; refundCents: number } {
  if (!policy.cancelRefundEnabled || amountCents <= 0) {
    return { feeCents: 0, refundCents: 0 };
  }

  let feeCents = 0;
  if (policy.cancelRefundFeeType === "fixed") {
    feeCents = policy.cancelRefundFeeCents;
  } else if (policy.cancelRefundFeeType === "percent") {
    feeCents = Math.round(
      (amountCents * policy.cancelRefundFeePercent) / 100,
    );
  }
  feeCents = Math.max(0, Math.min(amountCents, feeCents));
  return {
    feeCents,
    refundCents: Math.max(0, amountCents - feeCents),
  };
}

/** Human-readable policy lines for booking / cancel UIs (caller localizes wrappers). */
export type CancelPolicyDisplay = {
  minDaysBefore: number;
  refundEnabled: boolean;
  feeType: CancelRefundFeeType;
  feeCents: number;
  feePercent: number;
  hasFee: boolean;
};

export function toCancelPolicyDisplay(
  policy: SquareCancelRefundPolicy,
): CancelPolicyDisplay {
  const hasFee =
    policy.cancelRefundEnabled &&
    ((policy.cancelRefundFeeType === "fixed" &&
      policy.cancelRefundFeeCents > 0) ||
      (policy.cancelRefundFeeType === "percent" &&
        policy.cancelRefundFeePercent > 0));
  return {
    minDaysBefore: policy.cancelMinDaysBefore,
    refundEnabled: policy.cancelRefundEnabled,
    feeType: policy.cancelRefundFeeType,
    feeCents: policy.cancelRefundFeeCents,
    feePercent: policy.cancelRefundFeePercent,
    hasFee,
  };
}

export function formatFixedFee(
  cents: number,
  locale: string,
  currency: string,
) {
  return formatPriceCents(cents, locale, currency);
}
