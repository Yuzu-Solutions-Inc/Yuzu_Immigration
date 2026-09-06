import { deleteEntityDocuments } from './documents'
import { assertPeriodOpenForDate } from './fiscalPeriodClose'
import { deriveInvoiceStatus } from './invoice'
import { db } from './db'

export async function deleteInvoice(invoiceId: string, invoiceDate: string) {
  await assertPeriodOpenForDate(invoiceDate)
  await db.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
  await db.from('time_entries').update({ invoice_id: null }).eq('invoice_id', invoiceId)
  await db.from('projects').update({ invoice_id: null }).eq('invoice_id', invoiceId)
  await db.from('payments').delete().eq('invoice_id', invoiceId)
  await deleteEntityDocuments('invoice', invoiceId)
  const { error } = await db.from('invoices').delete().eq('id', invoiceId)
  if (error) throw error
}

export async function deletePayment(paymentId: string, invoiceId: string) {
  const { error } = await db.from('payments').delete().eq('id', paymentId)
  if (error) throw error
  await recalculateInvoiceStatus(invoiceId)
}

export async function recalculateInvoiceStatus(invoiceId: string) {
  const [{ data: inv }, { data: payments }] = await Promise.all([
    db.from('invoices').select('total, status').eq('id', invoiceId).single(),
    db.from('payments').select('amount').eq('invoice_id', invoiceId),
  ])
  if (!inv) return
  const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  const status = deriveInvoiceStatus(Number(inv.total), paid, inv.status)
  await db.from('invoices').update({ status }).eq('id', invoiceId)
}
