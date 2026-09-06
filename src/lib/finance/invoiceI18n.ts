import type { InvoiceLanguage } from './types'

const COPY = {
  fr: {
    invoiceTitle: 'FACTURE',
    number: 'N°',
    date: 'Date',
    dueDate: 'Échéance',
    paymentTerms: 'Conditions de paiement',
    currency: 'Devise',
    poNumber: 'N° BC',
    billTo: 'Facturer à :',
    neq: 'NEQ',
    dateCol: 'Date',
    description: 'Description',
    qty: 'Qté',
    unitPrice: 'Prix unit.',
    subtotal: 'Sous-total',
    amount: 'Montant',
    gst: 'TPS',
    qst: 'TVQ',
    hst: 'TVH',
    gstNumber: 'N° TPS',
    qstNumber: 'N° TVQ',
    total: 'Total',
  },
  en: {
    invoiceTitle: 'INVOICE',
    number: 'No.',
    date: 'Date',
    dueDate: 'Due date',
    paymentTerms: 'Payment terms',
    currency: 'Currency',
    poNumber: 'PO #',
    billTo: 'Bill to:',
    neq: 'NEQ',
    dateCol: 'Date',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    subtotal: 'Subtotal',
    amount: 'Amount',
    gst: 'GST',
    qst: 'QST',
    hst: 'HST',
    gstNumber: 'GST no.',
    qstNumber: 'QST no.',
    total: 'Total',
  },
} as const

export function invoiceCopy(lang: InvoiceLanguage) {
  return COPY[lang]
}

export function partnerInvoiceLanguage(
  languageOrPartner:
    | string
    | null
    | undefined
    | { language?: string | null; province?: string | null }
): InvoiceLanguage {
  if (languageOrPartner && typeof languageOrPartner === "object") {
    const province = languageOrPartner.province?.trim().toUpperCase() ?? "";
    if (province === "QC" || province.startsWith("QUEBEC") || province.startsWith("QUÉBEC")) {
      return "fr";
    }
    return languageOrPartner.language === "en" ? "en" : "fr";
  }
  return languageOrPartner === "en" ? "en" : "fr";
}
