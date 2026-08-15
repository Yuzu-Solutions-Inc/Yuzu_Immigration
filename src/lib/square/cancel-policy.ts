import { formatPriceCents } from "@/lib/booking/slots";

export type CancelRefundFeeType = "none" | "fixed" | "percent";

export type CancelRefundTier = "blocked" | "free" | "fee";

export type SquareCancelRefundPolicy = {
  cancelRefundEnabled: boolean;
  cancelFreeDaysBefore: number;
  /** Stored as cancel_min_days_before — last day guests may cancel (with fee if applicable). */
  cancelFeeDaysBefore: number;
  cancelRefundFeeType: CancelRefundFeeType;
  cancelRefundFeeCents: number;
  cancelRefundFeePercent: number;
};

export const DEFAULT_SQUARE_CANCEL_REFUND_POLICY: SquareCancelRefundPolicy = {
  cancelRefundEnabled: true,
  cancelFreeDaysBefore: 0,
  cancelFeeDaysBefore: 0,
  cancelRefundFeeType: "none",
  cancelRefundFeeCents: 0,
  cancelRefundFeePercent: 0,
};

export function parseCancelRefundFeeType(value: unknown): CancelRefundFeeType {
  if (value === "fixed" || value === "percent" || value === "none") {
    return value;
  }
  return "none";
}

export function normalizeSquareCancelRefundPolicy(
  row: Partial<{
    cancel_refund_enabled: boolean | null;
    cancel_free_days_before: number | null;
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
    cancelFreeDaysBefore: Math.max(
      0,
      Math.min(365, Math.trunc(Number(row.cancel_free_days_before) || 0)),
    ),
    cancelFeeDaysBefore: Math.max(
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

export function policyHasRefundFee(policy: SquareCancelRefundPolicy): boolean {
  return (
    policy.cancelRefundEnabled &&
    ((policy.cancelRefundFeeType === "fixed" &&
      policy.cancelRefundFeeCents > 0) ||
      (policy.cancelRefundFeeType === "percent" &&
        policy.cancelRefundFeePercent > 0))
  );
}

export function daysUntilAppointmentStart(
  startsAt: string,
  nowMs = Date.now(),
): number {
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return -1;
  return (startMs - nowMs) / 86_400_000;
}

export function isAppointmentStillUpcoming(
  startsAt: string,
  nowMs = Date.now(),
): boolean {
  const startMs = Date.parse(startsAt);
  return Number.isFinite(startMs) && startMs > nowMs;
}

/**
 * - blocked: too late to cancel
 * - free: full refund when refunds are enabled
 * - fee: partial refund (fee retained) when refunds are enabled
 */
export function resolveCancelRefundTier(
  policy: SquareCancelRefundPolicy,
  startsAt: string,
  nowMs = Date.now(),
): CancelRefundTier {
  if (!isAppointmentStillUpcoming(startsAt, nowMs)) return "blocked";

  const days = daysUntilAppointmentStart(startsAt, nowMs);
  const feeFloor = policy.cancelFeeDaysBefore;
  const freeThreshold = policy.cancelFreeDaysBefore;

  if (days < feeFloor) return "blocked";

  const hasFee = policyHasRefundFee(policy);
  if (hasFee) {
    if (freeThreshold > feeFloor && days >= freeThreshold) return "free";
    return "fee";
  }

  if (freeThreshold > 0 && days < freeThreshold) return "blocked";
  return "free";
}

/** @deprecated Use resolveCancelRefundTier */
export function isWithinGuestCancelWindow(
  startsAt: string,
  minDaysBefore: number,
  nowMs = Date.now(),
): boolean {
  const pseudo: SquareCancelRefundPolicy = {
    ...DEFAULT_SQUARE_CANCEL_REFUND_POLICY,
    cancelFeeDaysBefore: minDaysBefore,
  };
  return resolveCancelRefundTier(pseudo, startsAt, nowMs) !== "blocked";
}

export function computeCancelRefundAmounts(
  amountCents: number,
  policy: SquareCancelRefundPolicy,
  startsAt?: string,
  nowMs = Date.now(),
): { feeCents: number; refundCents: number } {
  if (!policy.cancelRefundEnabled || amountCents <= 0) {
    return { feeCents: 0, refundCents: 0 };
  }

  const tier = startsAt
    ? resolveCancelRefundTier(policy, startsAt, nowMs)
    : policyHasRefundFee(policy)
      ? "fee"
      : "free";

  if (tier === "blocked") {
    return { feeCents: 0, refundCents: 0 };
  }

  if (tier === "free") {
    return { feeCents: 0, refundCents: amountCents };
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
  freeDaysBefore: number;
  feeDaysBefore: number;
  refundEnabled: boolean;
  feeType: CancelRefundFeeType;
  feeCents: number;
  feePercent: number;
  hasFee: boolean;
  hasFeeTier: boolean;
};

export function toCancelPolicyDisplay(
  policy: SquareCancelRefundPolicy,
): CancelPolicyDisplay {
  const hasFee = policyHasRefundFee(policy);
  const hasFeeTier =
    hasFee && policy.cancelFreeDaysBefore > policy.cancelFeeDaysBefore;
  return {
    freeDaysBefore: policy.cancelFreeDaysBefore,
    feeDaysBefore: policy.cancelFeeDaysBefore,
    refundEnabled: policy.cancelRefundEnabled,
    feeType: policy.cancelRefundFeeType,
    feeCents: policy.cancelRefundFeeCents,
    feePercent: policy.cancelRefundFeePercent,
    hasFee,
    hasFeeTier,
  };
}

export function formatFixedFee(
  cents: number,
  locale: string,
  currency: string,
) {
  return formatPriceCents(cents, locale, currency);
}
