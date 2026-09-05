import "server-only";

import { randomBytes } from "node:crypto";
import type Stripe from "stripe";

import { getAppBaseUrl } from "@/lib/app-url";
import { createServiceClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import {
  STRIPE_CONNECTION_SELECT,
  cancelPolicyColumns,
  copyCancelPolicyOnto,
  type StripeConnectionRow,
} from "@/lib/payments/processor";

function checkoutIntegrationId(prefix: string) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = randomBytes(8);
  const suffix = Array.from(bytes, (byte) => alphabet[byte % 26]).join("");
  return `${prefix}_${suffix}`;
}

export function payCheckoutIntegrationId() {
  return checkoutIntegrationId("permitos_pay");
}

type V2MerchantAccount = {
  id: string;
  display_name?: string | null;
  object?: string;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: { status?: string };
        stripe_balance?: { payouts?: { status?: string } };
      };
    };
  };
  requirements?: { summary?: { minimum_deadline?: unknown } };
};

const V2_ACCOUNT_INCLUDE = [
  "configuration.merchant",
  "identity",
  "requirements",
] as const;

type V2AccountsApi = {
  create: (params: Record<string, unknown>) => Promise<V2MerchantAccount>;
  retrieve: (
    id: string,
    params?: Record<string, unknown>,
  ) => Promise<V2MerchantAccount>;
};

type V2AccountLinksApi = {
  create: (params: {
    account: string;
    use_case: {
      type: "account_onboarding";
      account_onboarding: {
        configurations: Array<"merchant">;
        return_url: string;
        refresh_url: string;
      };
    };
  }) => Promise<{ url?: string | null }>;
};

function v2Core(stripe: Stripe) {
  return stripe.v2.core as {
    accounts: V2AccountsApi;
    accountLinks: V2AccountLinksApi;
  };
}

function isMerchantChargesReady(account: Stripe.Account | V2MerchantAccount) {
  const v2 = account as V2MerchantAccount;
  const v2Card =
    v2.configuration?.merchant?.capabilities?.card_payments?.status;
  if (v2Card) return v2Card === "active";
  const v1 = account as Stripe.Account;
  return (
    v1.capabilities?.card_payments === "active" || v1.charges_enabled === true
  );
}

function isMerchantPayoutsReady(account: Stripe.Account | V2MerchantAccount) {
  const v2 = account as V2MerchantAccount;
  const v2Payouts =
    v2.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status;
  if (v2Payouts) return v2Payouts === "active";
  const v1 = account as Stripe.Account;
  return v1.payouts_enabled === true;
}

function accountDisplayName(account: Stripe.Account | V2MerchantAccount) {
  const v2 = account as V2MerchantAccount;
  if (v2.display_name) return v2.display_name;
  const v1 = account as Stripe.Account;
  return (
    v1.business_profile?.name ||
    v1.settings?.dashboard?.display_name ||
    v1.email ||
    v1.id
  );
}

async function createConnectedAccount(input: {
  organizationId: string;
  email?: string | null;
  businessName?: string | null;
}) {
  const stripe = getStripe();
  try {
    return await v2Core(stripe).accounts.create({
      display_name: input.businessName || undefined,
      contact_email: input.email || undefined,
      dashboard: "full",
      identity: { country: "ca" },
      defaults: {
        currency: "cad",
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      metadata: { organization_id: input.organizationId },
      include: [...V2_ACCOUNT_INCLUDE],
    });
  } catch (error) {
    console.error("v2 connected account create, using accounts.create:", error);
  }

  return stripe.accounts.create({
    country: "CA",
    email: input.email || undefined,
    business_profile: input.businessName
      ? { name: input.businessName }
      : undefined,
    metadata: { organization_id: input.organizationId },
    controller: {
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
      stripe_dashboard: { type: "full" },
    },
    capabilities: {
      card_payments: { requested: true },
    },
  });
}

async function retrieveConnectedAccount(accountId: string) {
  const stripe = getStripe();
  try {
    return await v2Core(stripe).accounts.retrieve(accountId, {
      include: [...V2_ACCOUNT_INCLUDE],
    });
  } catch (error) {
    console.error("v2 account retrieve:", error);
  }
  return stripe.accounts.retrieve(accountId);
}

export async function syncStripeConnectionFromAccount(
  organizationId: string,
  accountId: string,
) {
  const account = await retrieveConnectedAccount(accountId);
  const admin = createServiceClient();
  const { error } = await admin
    .from("stripe_connections")
    .update({
      charges_ready: isMerchantChargesReady(account),
      payouts_ready: isMerchantPayoutsReady(account),
      details_submitted:
        (account as Stripe.Account).details_submitted === true ||
        isMerchantChargesReady(account),
      business_name: accountDisplayName(account),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("stripe_account_id", accountId);
  if (error) {
    console.error("syncStripeConnectionFromAccount:", error.message);
  }
}

export async function createStripeAccountOnboardingLink(input: {
  accountId: string;
  locale: string;
}) {
  const stripe = getStripe();
  const origin = await getAppBaseUrl();
  const base = `${origin.replace(/\/$/, "")}/${input.locale}/settings/payments`;
  const refreshUrl = `${base}?stripe=refresh`;
  const returnUrl = `${base}?stripe=return`;

  try {
    const link = await v2Core(stripe).accountLinks.create({
      account: input.accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant"],
          refresh_url: refreshUrl,
          return_url: returnUrl,
        },
      },
    });
    if (link.url) return link.url;
  } catch (error) {
    console.error("v2 account link, using accountLinks.create:", error);
  }

  const link = await stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  if (!link.url) throw new Error("stripe_onboarding_link_failed");
  return link.url;
}

export async function ensureStripeConnectedAccount(input: {
  organizationId: string;
  userId: string;
  email?: string | null;
  businessName?: string | null;
}): Promise<StripeConnectionRow> {
  const admin = createServiceClient();
  const existing = await admin
    .from("stripe_connections")
    .select(STRIPE_CONNECTION_SELECT)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (existing.data) {
    const row = existing.data as StripeConnectionRow;
    await copyCancelPolicyOnto(input.organizationId, "stripe");
    const { error } = await admin
      .from("stripe_connections")
      .update({
        is_enabled: true,
        connected_by: input.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    await syncStripeConnectionFromAccount(
      input.organizationId,
      row.stripe_account_id,
    );
    const refreshed = await admin
      .from("stripe_connections")
      .select(STRIPE_CONNECTION_SELECT)
      .eq("id", row.id)
      .single();
    if (refreshed.error || !refreshed.data) {
      throw new Error(refreshed.error?.message ?? "stripe_connection_missing");
    }
    return refreshed.data as StripeConnectionRow;
  }

  const account = await createConnectedAccount({
    organizationId: input.organizationId,
    email: input.email,
    businessName: input.businessName,
  });

  const inserted = await admin
    .from("stripe_connections")
    .insert({
      organization_id: input.organizationId,
      connected_by: input.userId,
      stripe_account_id: account.id,
      currency: "CAD",
      business_name: accountDisplayName(account),
      charges_ready: isMerchantChargesReady(account),
      payouts_ready: isMerchantPayoutsReady(account),
      details_submitted:
        (account as Stripe.Account).details_submitted === true,
      is_enabled: true,
      ...cancelPolicyColumns(),
    })
    .select(STRIPE_CONNECTION_SELECT)
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? "stripe_connection_insert_failed");
  }
  await copyCancelPolicyOnto(input.organizationId, "stripe");
  return inserted.data as StripeConnectionRow;
}
