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
  const v2Create = (
    stripe as unknown as {
      v2?: {
        core?: {
          accounts?: {
            create: (params: Record<string, unknown>) => Promise<V2MerchantAccount>;
          };
        };
      };
    }
  ).v2?.core?.accounts?.create;

  if (v2Create) {
    try {
      return await v2Create({
        display_name: input.businessName || undefined,
        contact_email: input.email || undefined,
        dashboard: "full",
        identity: { country: "ca" },
        defaults: {
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
      });
    } catch (error) {
      console.error("v2 connected account create, using accounts.create:", error);
    }
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
      transfers: { requested: true },
    },
  });
}

async function retrieveConnectedAccount(accountId: string) {
  const stripe = getStripe();
  const v2Retrieve = (
    stripe as unknown as {
      v2?: {
        core?: {
          accounts?: {
            retrieve: (
              id: string,
              params?: Record<string, unknown>,
            ) => Promise<V2MerchantAccount>;
          };
        };
      };
    }
  ).v2?.core?.accounts?.retrieve;

  if (v2Retrieve) {
    try {
      return await v2Retrieve(accountId, {
        include: ["configuration", "requirements", "identity"],
      });
    } catch (error) {
      console.error("v2 account retrieve:", error);
    }
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
  const link = await stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: `${base}?stripe=refresh`,
    return_url: `${base}?stripe=return`,
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
