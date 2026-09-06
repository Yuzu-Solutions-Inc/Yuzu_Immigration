import type { Project, TimeEntry } from './types'
import { effectiveRate, formatCad, lineAmount } from './format'
import { computePlaceOfSupply, type PlaceOfSupplyResult } from './placeOfSupply'
import { normalizeCaRegion } from '../sage/tax-regions'
import { round2, type TaxBreakdown, type TaxSettings } from './taxes'

export type InvoiceTaxes = TaxBreakdown & {
  placeOfSupply?: PlaceOfSupplyResult
}

/** Tax-exclusive line. GST/HST/QST live only on the invoice header. */
export interface InvoiceLineDraft {
  project_id: string | null
  time_entry_id: string | null
  line_date: string | null
  description: string
  quantity: number
  unit_label: string
  unit_price: number
  subtotal: number
  sort_order: number
}

function toInvoiceTaxColumns(pos: PlaceOfSupplyResult, settings: TaxSettings): InvoiceTaxes {
  if (pos.regime === 'hst') {
    const gst = settings.charge_gst ? pos.hst : 0
    return { subtotal: pos.subtotal, gst, qst: 0, total: round2(pos.subtotal + gst), placeOfSupply: pos }
  }
  const gst = settings.charge_gst ? pos.gst : 0
  const qst = settings.charge_qst && pos.regime === 'gst_qst' ? pos.qst : 0
  return { subtotal: pos.subtotal, gst, qst, total: round2(pos.subtotal + gst + qst), placeOfSupply: pos }
}

/**
 * GST/HST/QST for an invoice: one calculation on the HT subtotal, rounded to the cent.
 *
 * CRA and Revenu Québec allow either this invoice-total method or summing per-line
 * taxes. We use invoice-total only — professional services have one place of supply
 * (the partner), and per-line rounding drifts by a cent.
 */
export function computeInvoiceTotals(
  subtotal: number,
  settings: TaxSettings,
  partnerProvince?: string | null
): InvoiceTaxes {
  if (!settings.charge_gst && !settings.charge_qst) {
    const base = round2(subtotal)
    return { subtotal: base, gst: 0, qst: 0, total: base }
  }
  const province = normalizeCaRegion(partnerProvince) ?? 'QC'
  return toInvoiceTaxColumns(computePlaceOfSupply(subtotal, province), settings)
}

export function invoiceTotalsFromLines(
  lines: { subtotal: number }[],
  settings: TaxSettings,
  partnerProvince?: string | null
): InvoiceTaxes {
  const subtotal = round2(lines.reduce((s, l) => s + Number(l.subtotal), 0))
  return computeInvoiceTotals(subtotal, settings, partnerProvince)
}

export function invoiceTaxDisplayRows(
  amounts: { gst: number; qst: number },
  partnerProvince: string | null | undefined,
  labels: { gst: string; qst: string; hst: string }
): { label: string; amount: number }[] {
  const gst = round2(Number(amounts.gst) || 0)
  const qst = round2(Number(amounts.qst) || 0)
  const regime = computePlaceOfSupply(1, normalizeCaRegion(partnerProvince) ?? 'QC').regime
  const rows: { label: string; amount: number }[] = []
  if (gst > 0) rows.push({ label: regime === 'hst' ? labels.hst : labels.gst, amount: gst })
  if (qst > 0) rows.push({ label: labels.qst, amount: qst })
  return rows
}

export function salesTaxLinesForInvoice(
  invoiceId: string,
  totals: InvoiceTaxes
): Array<{
  source_type: 'invoice'
  source_id: string
  province: string | null
  tax_code: string
  rate: number
  amount: number
  recoverable_kind: string
  recoverable_amount: number
  collected_account: string | null
  recoverable_account: string | null
}> {
  const pos = totals.placeOfSupply
  if (!pos || totals.gst + totals.qst <= 0) return []
  return pos.lines
    .filter((line) => {
      if (line.amount <= 0 || line.code === 'PST') return false
      if (line.code === 'QST') return totals.qst > 0
      return totals.gst > 0
    })
    .map((line) => ({
      source_type: 'invoice' as const,
      source_id: invoiceId,
      province: pos.province,
      tax_code: line.code,
      rate: line.rate,
      amount: line.amount,
      recoverable_kind: line.recoverableKind,
      recoverable_amount: 0,
      collected_account: line.collectedAccount,
      recoverable_account: line.recoverableAccount,
    }))
}

export function buildLineFromTimeEntry(entry: TimeEntry, sortOrder: number): InvoiceLineDraft {
  const project = entry.projects!
  const rate = effectiveRate(entry, project)
  const subtotal = lineAmount(Number(entry.hours), rate)
  return {
    project_id: entry.project_id,
    time_entry_id: entry.id,
    line_date: entry.entry_date,
    description: entry.description?.trim() || 'Travail',
    quantity: Number(entry.hours),
    unit_label: 'h',
    unit_price: rate,
    subtotal: round2(subtotal),
    sort_order: sortOrder,
  }
}

export function buildLineFromFixedProject(project: Project, sortOrder: number): InvoiceLineDraft {
  const subtotal = Number(project.fixed_price ?? 0)
  return {
    project_id: project.id,
    time_entry_id: null,
    line_date: null,
    description: project.name,
    quantity: 1,
    unit_label: 'forfait',
    unit_price: subtotal,
    subtotal: round2(subtotal),
    sort_order: sortOrder,
  }
}

export function buildLegacyLinesFromTimeEntries(entries: TimeEntry[]): InvoiceLineDraft[] {
  return entries.map((e, i) => buildLineFromTimeEntry(e, i))
}

export function invoiceBalance(total: number, paid: number) {
  return round2(total - paid)
}

export function deriveInvoiceStatus(
  total: number,
  paid: number,
  current: string
): 'draft' | 'sent' | 'partial' | 'paid' | 'void' {
  if (current === 'void') return 'void'
  if (paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return current === 'draft' ? 'draft' : 'sent'
}

export function billingTypeLabel(type: string): string {
  return type === 'fixed' ? 'Forfait' : 'Horaire'
}

export function projectAmountLabel(project: Pick<Project, 'billing_type' | 'default_hourly_rate' | 'fixed_price'>): string {
  if (project.billing_type === 'fixed') {
    return project.fixed_price != null ? formatCad(project.fixed_price) : '—'
  }
  return `${formatCad(project.default_hourly_rate)}/h`
}

/** Distinct non-empty PO / BC numbers from projects linked to an invoice. */
export function distinctPoNumbers(projects: Pick<Project, 'po_number'>[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const project of projects) {
    const po = project.po_number?.trim()
    if (!po || seen.has(po)) continue
    seen.add(po)
    out.push(po)
  }
  return out
}
