import {
  sageFetchJson,
  type SageConnectionRow,
} from "./client";

export async function createSageSalesInvoice(input: {
  connection: SageConnectionRow;
  contactId: string;
  date: string;
  reference: string;
  description: string;
  unitPrice: number;
  taxRateId: string;
}) {
  const ledgerId = input.connection.default_ledger_account_id;
  if (!ledgerId) throw new Error("sage_ledger_missing");

  const payload = {
    sales_invoice: {
      contact_id: input.contactId,
      date: input.date,
      reference: input.reference.slice(0, 25),
      invoice_lines: [
        {
          description: input.description.slice(0, 200),
          ledger_account_id: ledgerId,
          quantity: "1",
          unit_price: input.unitPrice.toFixed(2),
          tax_rate_id: input.taxRateId,
        },
      ],
    },
  };

  const result = await sageFetchJson<{
    id?: string;
    sales_invoice?: { id?: string };
  }>(input.connection, "/sales_invoices", {
    method: "POST",
    headers: { "Idempotency-Key": `invoice-${input.reference}` },
    body: JSON.stringify(payload),
  });

  return result.sales_invoice?.id ?? result.id ?? null;
}
