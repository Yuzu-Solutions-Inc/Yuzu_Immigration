"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import { stripeConfigured } from "@/lib/stripe/client";
import {
  createStripeAccountOnboardingLink,
  ensureStripeConnectedAccount,
  syncStripeConnectionFromAccount,
} from "@/lib/stripe/connect-accounts";
import { getOrgStripeConnectionRecord } from "@/lib/payments/processor";

export type StripeConnectActionState = {
  error?: string;
  message?: string;
};

async function requireAdmin() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  if (!canAdministerOrg(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { ok: false as const, error: locked };
  return { ok: true as const, membership, user };
}

export async function startStripeConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(
      `/${locale}/settings/payments?stripe=${encodeURIComponent(reason)}`,
    );
  };
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!stripeConfigured()) return fail("not_configured");

  let destination: string;
  try {
    const connection = await ensureStripeConnectedAccount({
      organizationId: gate.membership.organization.id,
      userId: gate.user.id,
      email: gate.user.email,
      businessName: gate.membership.organization.name,
    });
    if (connection.charges_ready) {
      revalidatePath(`/${locale}/settings/payments`);
      destination = `/${locale}/settings/payments?stripe=connected`;
    } else {
      destination = await createStripeAccountOnboardingLink({
        accountId: connection.stripe_account_id,
        locale,
      });
    }
  } catch (error) {
    console.error("startStripeConnectAction:", error);
    return fail("save_failed");
  }
  redirect(destination);
}

export async function continueStripeOnboardingAction(formData: FormData) {
  return startStripeConnectAction(formData);
}

export async function syncStripeConnectReturnAction(locale: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const connection = await getOrgStripeConnectionRecord(
    gate.membership.organization.id,
  );
  if (!connection) return;
  await syncStripeConnectionFromAccount(
    gate.membership.organization.id,
    connection.stripe_account_id,
  );
  revalidatePath(`/${locale}/settings/payments`);
}

export async function resumeStripeOnboardingAction(locale: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return;
  const connection = await getOrgStripeConnectionRecord(
    gate.membership.organization.id,
  );
  if (!connection) return;
  await syncStripeConnectionFromAccount(
    gate.membership.organization.id,
    connection.stripe_account_id,
  );
  const refreshed = await getOrgStripeConnectionRecord(
    gate.membership.organization.id,
  );
  if (refreshed?.charges_ready) {
    revalidatePath(`/${locale}/settings/payments`);
    return;
  }
  const url = await createStripeAccountOnboardingLink({
    accountId: connection.stripe_account_id,
    locale,
  });
  redirect(url);
}

export async function disconnectStripeAction(
  locale: string,
): Promise<StripeConnectActionState> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.error };
  const { disablePaymentProcessor } = await import("@/lib/payments/processor");
  try {
    await disablePaymentProcessor(gate.membership.organization.id, "stripe");
  } catch (error) {
    console.error("disconnectStripeAction:", error);
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/settings/payments`);
  return { message: "disconnected" };
}
