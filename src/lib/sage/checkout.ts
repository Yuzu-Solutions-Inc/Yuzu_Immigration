import { getAppBaseUrl } from "@/lib/app-url";
import { createServiceClient } from "@/lib/supabase/admin";
import { getOrgSageConnection } from "@/lib/sage/client";
import {
  type SageMainAddress,
} from "@/lib/sage/contacts";
import { createSageSalesInvoice } from "@/lib/sage/invoices";
import { linkOrCreateSageContactForPerson } from "@/lib/sage/sync-people";
import {
  mappingPercent,
  resolveTaxMapping,
  type SageTaxMappingRow,
} from "@/lib/sage/tax";
import {
  expectedCaTax,
  hasTaxJurisdiction,
  normalizeCaRegion,
  normalizeCountryCode,
  taxCentsFromPercent,
} from "@/lib/sage/tax-regions";
import { createSquarePaymentLink, getOrgSquareConnection } from "@/lib/square/client";
import {
  loadPaymentByToken,
  type PaymentRequestRow,
} from "@/lib/square/payments";

export type PaymentTaxBreakdown = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxPercent: number;
  taxLabel: string;
  country: string;
  region: string | null;
  sageTaxRateId: string | null;
};

function mappingLabel(row: SageTaxMappingRow, country: string, region: string | null) {
  if (row.sage_tax_rate_name) return row.sage_tax_rate_name;
  if (country === "CA") return expectedCaTax(region)?.label ?? "Tax";
  return "Tax";
}

export async function loadSageTaxMappings(organizationId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("sage_tax_mappings")
    .select(
      "id, organization_id, country_code, region_code, sage_tax_rate_id, sage_tax_rate_name, percentage",
    )
    .eq("organization_id", organizationId);
  if (error) {
    console.error("loadSageTaxMappings:", error.message);
    return [];
  }
  return (data ?? []) as SageTaxMappingRow[];
}

export function taxFromJurisdiction(input: {
  mappings: SageTaxMappingRow[];
  country: string;
  region: string | null;
  subtotalCents: number;
}): PaymentTaxBreakdown {
  const country = normalizeCountryCode(input.country) ?? input.country;
  const region =
    country === "CA" ? normalizeCaRegion(input.region) : input.region;
  const mapping = resolveTaxMapping({
    mappings: input.mappings,
    country,
    region,
  });
  const fallback = country === "CA" ? expectedCaTax(region) : null;
  const percent = mapping
    ? mappingPercent(mapping)
    : (fallback?.percent ?? 0);
  const label = mapping
    ? mappingLabel(mapping, country, region)
    : (fallback?.label ?? "Tax");
  const taxCents = taxCentsFromPercent(input.subtotalCents, percent);
  return {
    subtotalCents: input.subtotalCents,
    taxCents,
    totalCents: input.subtotalCents + taxCents,
    taxPercent: percent,
    taxLabel: label,
    country,
    region,
    sageTaxRateId: mapping?.sage_tax_rate_id ?? null,
  };
}

export async function personTaxAddress(input: {
  organizationId: string;
  personId: string | null;
}) {
  if (!input.personId) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("people")
    .select(
      "sage_contact_id, sage_has_main_address, sage_address_country, sage_address_region",
    )
    .eq("id", input.personId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (!data) return null;
  const country = (data.sage_address_country as string | null) ?? null;
  const region = (data.sage_address_region as string | null) ?? null;
  const hasAddress = Boolean(data.sage_has_main_address);
  if (
    !hasAddress ||
    !hasTaxJurisdiction({ country, region })
  ) {
    return {
      sageContactId: (data.sage_contact_id as string | null) ?? null,
      hasAddress: false,
      country,
      region,
    };
  }
  return {
    sageContactId: (data.sage_contact_id as string | null) ?? null,
    hasAddress: true,
    country,
    region,
  };
}

export async function createTaxedSquareCheckout(input: {
  payment: PaymentRequestRow;
  token: string;
  locale: string;
  tax: PaymentTaxBreakdown;
  buyerEmail?: string | null;
}) {
  const connection = await getOrgSquareConnection(input.payment.organization_id);
  if (!connection) throw new Error("square_not_connected");
  const origin = await getAppBaseUrl();
  const redirectUrl = `${origin.replace(/\/$/, "")}/${input.locale}/pay/${input.token}`;

  const link = await createSquarePaymentLink({
    connection,
    amountCents: input.tax.subtotalCents,
    currency: input.payment.currency,
    name: input.payment.description,
    paymentNote: input.payment.id,
    redirectUrl,
    buyerEmail: input.buyerEmail,
    tax:
      input.tax.taxCents > 0
        ? { name: input.tax.taxLabel, percentage: input.tax.taxPercent }
        : null,
  });

  const admin = createServiceClient();
  const { data: updated, error } = await admin
    .from("payment_requests")
    .update({
      tax_cents: input.tax.taxCents,
      tax_percent: input.tax.taxPercent,
      tax_label: input.tax.taxLabel,
      tax_country: input.tax.country,
      tax_region: input.tax.region,
      sage_tax_rate_id: input.tax.sageTaxRateId,
      square_payment_link_id: link.paymentLinkId,
      square_order_id: link.orderId,
      checkout_url: link.checkoutUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.payment.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error || !updated) {
    console.error("createTaxedSquareCheckout:", error?.message);
    throw new Error("payment_link_save_failed");
  }
  return updated as PaymentRequestRow & { checkout_url: string | null };
}

export async function prepareSagePaymentCheckout(input: {
  token: string;
  locale: string;
  address?: SageMainAddress | null;
}) {
  const payment = await loadPaymentByToken(input.token);
  if (!payment || payment.status !== "pending") {
    return { error: "unavailable" as const };
  }
  if (payment.expires_at && Date.parse(payment.expires_at) < Date.now()) {
    return { error: "expired" as const };
  }

  const sage = await getOrgSageConnection(payment.organization_id);
  if (sage) {
    if (!payment.person_id) {
      const tax = {
        subtotalCents: payment.amount_cents,
        taxCents: 0,
        totalCents: payment.amount_cents,
        taxPercent: 0,
        taxLabel: "Tax",
        country: "",
        region: null,
        sageTaxRateId: null,
      };
      if (payment.checkout_url) {
        return { payment, tax, checkoutUrl: payment.checkout_url };
      }
      const updated = await createTaxedSquareCheckout({
        payment,
        token: input.token,
        locale: input.locale,
        tax,
      });
      return { payment: updated, tax, checkoutUrl: updated.checkout_url };
    }
  } else {
    return { error: "sage_not_connected" as const };
  }

  if (input.address && payment.person_id) {
    const line1 = [input.address.line1, input.address.line2]
      .filter(Boolean)
      .join(", ");
    await linkOrCreateSageContactForPerson({
      organizationId: payment.organization_id,
      personId: payment.person_id,
      connection: sage,
      address: {
        ...input.address,
        line1,
      },
    });
  } else if (payment.person_id) {
    await linkOrCreateSageContactForPerson({
      organizationId: payment.organization_id,
      personId: payment.person_id,
      connection: sage,
    });
  }

  const addressState = await personTaxAddress({
    organizationId: payment.organization_id,
    personId: payment.person_id,
  });
  const country =
    input.address?.country || addressState?.country || null;
  const region = input.address?.region || addressState?.region || null;
  if (!hasTaxJurisdiction({ country, region })) {
    return { error: "address_required" as const, payment };
  }

  const mappings = await loadSageTaxMappings(payment.organization_id);
  const tax = taxFromJurisdiction({
    mappings,
    country: country as string,
    region,
    subtotalCents: payment.amount_cents,
  });

  if (payment.checkout_url && payment.tax_cents === tax.taxCents) {
    return { payment, tax, checkoutUrl: payment.checkout_url };
  }

  const admin = createServiceClient();
  let buyerEmail: string | null = null;
  if (payment.person_id) {
    const { data: person } = await admin
      .from("people")
      .select("email")
      .eq("id", payment.person_id)
      .maybeSingle();
    if (person?.email) {
      const { decryptPersonRow } = await import("@/lib/security/client-pii");
      const { getOrgDataKey } = await import("@/lib/security/org-data-key");
      const dek = await getOrgDataKey(payment.organization_id);
      buyerEmail = decryptPersonRow({ email: person.email as string }, dek)
        .email as string | null;
    }
  }

  const updated = await createTaxedSquareCheckout({
    payment,
    token: input.token,
    locale: input.locale,
    tax,
    buyerEmail,
  });

  return {
    payment: updated,
    tax,
    checkoutUrl: updated.checkout_url,
  };
}

export async function createSageInvoiceForPayment(payment: PaymentRequestRow) {
  if (payment.sage_invoice_id) return payment.sage_invoice_id;
  const sage = await getOrgSageConnection(payment.organization_id);
  if (!sage?.default_ledger_account_id) return null;
  if (!payment.person_id) return null;

  const contact = await linkOrCreateSageContactForPerson({
    organizationId: payment.organization_id,
    personId: payment.person_id,
    connection: sage,
  });
  if (!contact?.id) return null;

  const admin = createServiceClient();
  const { data: row } = await admin
    .from("payment_requests")
    .select("sage_tax_rate_id, tax_percent, amount_cents")
    .eq("id", payment.id)
    .maybeSingle();
  const taxRateId = (row?.sage_tax_rate_id as string | null) ?? null;
  if (!taxRateId) return null;

  const invoiceId = await createSageSalesInvoice({
    connection: sage,
    contactId: contact.id,
    date: new Date().toISOString().slice(0, 10),
    reference: `YUZU-${payment.id.replace(/-/g, "").slice(0, 16)}`,
    description: payment.description,
    unitPrice: ((row?.amount_cents as number) ?? payment.amount_cents) / 100,
    taxRateId,
  });
  if (!invoiceId) return null;

  await admin
    .from("payment_requests")
    .update({
      sage_invoice_id: invoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);
  return invoiceId;
}
