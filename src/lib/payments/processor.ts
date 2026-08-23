import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SQUARE_CANCEL_REFUND_POLICY,
  type SquareCancelRefundPolicy,
} from "@/lib/square/cancel-policy";
import type { SquareConnectionRow } from "@/lib/square/client";

export type PaymentProcessor = "square" | "stripe";

export type StripeConnectionRow = {
  id: string;
  organization_id: string;
  connected_by: string | null;
  stripe_account_id: string;
  currency: string;
  business_name: string | null;
  charges_ready: boolean;
  payouts_ready: boolean;
  details_submitted: boolean;
  is_enabled: boolean;
  cancel_refund_enabled: boolean;
  cancel_free_days_before: number;
  cancel_min_days_before: number;
  cancel_refund_fee_type: string;
  cancel_refund_fee_cents: number;
  cancel_refund_fee_percent: number;
};

export const STRIPE_CONNECTION_SELECT =
  "id, organization_id, connected_by, stripe_account_id, currency, business_name, charges_ready, payouts_ready, details_submitted, is_enabled, cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent";

export type ActiveCheckoutProcessor =
  | {
      processor: "square";
      currency: string;
      square: SquareConnectionRow;
    }
  | {
      processor: "stripe";
      currency: string;
      stripe: StripeConnectionRow;
    };

const CANCEL_POLICY_PATCH_KEYS = [
  "cancel_refund_enabled",
  "cancel_free_days_before",
  "cancel_min_days_before",
  "cancel_refund_fee_type",
  "cancel_refund_fee_cents",
  "cancel_refund_fee_percent",
] as const;

export type CancelPolicyColumns = Pick<
  StripeConnectionRow,
  (typeof CANCEL_POLICY_PATCH_KEYS)[number]
>;

export function cancelPolicyColumns(
  policy: SquareCancelRefundPolicy = DEFAULT_SQUARE_CANCEL_REFUND_POLICY,
): CancelPolicyColumns {
  return {
    cancel_refund_enabled: policy.cancelRefundEnabled,
    cancel_free_days_before: policy.cancelFreeDaysBefore,
    cancel_min_days_before: policy.cancelFeeDaysBefore,
    cancel_refund_fee_type: policy.cancelRefundFeeType,
    cancel_refund_fee_cents: policy.cancelRefundFeeCents,
    cancel_refund_fee_percent: policy.cancelRefundFeePercent,
  };
}

function policyFromRow(
  row: CancelPolicyColumns | null | undefined,
): CancelPolicyColumns {
  if (!row) return cancelPolicyColumns();
  return {
    cancel_refund_enabled: row.cancel_refund_enabled,
    cancel_free_days_before: row.cancel_free_days_before,
    cancel_min_days_before: row.cancel_min_days_before,
    cancel_refund_fee_type: row.cancel_refund_fee_type,
    cancel_refund_fee_cents: row.cancel_refund_fee_cents,
    cancel_refund_fee_percent: row.cancel_refund_fee_percent,
  };
}

export async function getOrgStripeConnection(
  organizationId: string,
): Promise<StripeConnectionRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("stripe_connections")
    .select(STRIPE_CONNECTION_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_enabled", true)
    .maybeSingle();
  if (error) {
    console.error("getOrgStripeConnection:", error.message);
    return null;
  }
  return (data as StripeConnectionRow | null) ?? null;
}

export async function getOrgStripeConnectionRecord(
  organizationId: string,
): Promise<StripeConnectionRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("stripe_connections")
    .select(STRIPE_CONNECTION_SELECT)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("getOrgStripeConnectionRecord:", error.message);
    return null;
  }
  return (data as StripeConnectionRow | null) ?? null;
}

export async function getStripeConnectionByAccountId(
  stripeAccountId: string,
): Promise<StripeConnectionRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("stripe_connections")
    .select(STRIPE_CONNECTION_SELECT)
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (error) {
    console.error("getStripeConnectionByAccountId:", error.message);
    return null;
  }
  return (data as StripeConnectionRow | null) ?? null;
}

export async function getActiveCheckoutProcessor(
  organizationId: string,
): Promise<ActiveCheckoutProcessor | null> {
  const stripe = await getOrgStripeConnection(organizationId);
  if (stripe?.charges_ready) {
    return {
      processor: "stripe",
      currency: stripe.currency || "CAD",
      stripe,
    };
  }

  const { getOrgSquareConnection } = await import("@/lib/square/client");
  const square = await getOrgSquareConnection(organizationId);
  if (square) {
    return {
      processor: "square",
      currency: square.currency || "CAD",
      square,
    };
  }
  return null;
}

export async function loadEnabledCancelPolicyRow(
  organizationId: string,
): Promise<CancelPolicyColumns | null> {
  const admin = createServiceClient();
  const [{ data: stripe }, { data: square }] = await Promise.all([
    admin
      .from("stripe_connections")
      .select(
        "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
      )
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .maybeSingle(),
    admin
      .from("square_connections")
      .select(
        "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent, is_enabled",
      )
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .maybeSingle(),
  ]);
  const row = (stripe ?? square) as CancelPolicyColumns | null;
  return row;
}

export async function copyCancelPolicyOnto(
  organizationId: string,
  target: "square" | "stripe",
) {
  const admin = createServiceClient();
  const other = target === "stripe" ? "square_connections" : "stripe_connections";
  const dest = target === "stripe" ? "stripe_connections" : "square_connections";
  const { data } = await admin
    .from(other)
    .select(
      "cancel_refund_enabled, cancel_free_days_before, cancel_min_days_before, cancel_refund_fee_type, cancel_refund_fee_cents, cancel_refund_fee_percent",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return;
  const patch = policyFromRow(data as CancelPolicyColumns);
  await admin
    .from(dest)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}

export async function saveEnabledCancelPolicy(
  organizationId: string,
  policy: CancelPolicyColumns,
) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const patch = { ...policy, updated_at: now };
  const stripe = await getOrgStripeConnection(organizationId);
  if (stripe) {
    const { error } = await admin
      .from("stripe_connections")
      .update(patch)
      .eq("id", stripe.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin
    .from("square_connections")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  if (error) throw new Error(error.message);
}

export async function disablePaymentProcessor(
  organizationId: string,
  processor: PaymentProcessor,
) {
  const admin = createServiceClient();
  const table =
    processor === "stripe" ? "stripe_connections" : "square_connections";
  const { error } = await admin
    .from(table)
    .update({ is_enabled: false, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);
  if (error) {
    console.error("disablePaymentProcessor:", error.message);
    throw new Error(error.message);
  }
}
