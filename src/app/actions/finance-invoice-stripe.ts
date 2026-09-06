"use server";

import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { createInvoiceCheckoutUrl } from "@/lib/finance/invoice-stripe";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  invoiceId: z.string().uuid(),
});

export async function createInvoiceStripeLinkAction(
  invoiceId: string,
): Promise<{ url?: string; error?: string }> {
  const parsed = schema.safeParse({ invoiceId });
  if (!parsed.success) return { error: "invalid" };

  const user = await getSessionUser();
  const membership = await getPrimaryMembership();
  if (!user || !membership) return { error: "auth" };
  if (!isModuleEnabled(membership.enabledModules, "finance")) {
    return { error: "forbidden" };
  }
  if (!membership.organization.writable) return { error: "trial_expired" };

  const supabase = await createClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, currency, status, partners(email)")
    .eq("id", parsed.data.invoiceId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (error || !invoice) return { error: "not_found" };
  if (invoice.status === "void" || invoice.status === "paid") {
    return { error: "not_payable" };
  }

  const partner = Array.isArray(invoice.partners)
    ? invoice.partners[0]
    : invoice.partners;
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const locale = membership.organization.defaultLocale;

  try {
    const checkout = await createInvoiceCheckoutUrl({
      organizationId: membership.organization.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number as string,
      amount: Number(invoice.total),
      currency: (invoice.currency as string) || "CAD",
      customerEmail: (partner?.email as string | null) ?? null,
      successUrl: `${origin}/${locale}/engagements/invoices?paid=${invoice.id}`,
      cancelUrl: `${origin}/${locale}/engagements/invoices`,
    });
    return { url: checkout.url };
  } catch (cause) {
    console.error("createInvoiceStripeLinkAction", cause);
    return { error: "stripe_failed" };
  }
}
