import type { OrganizationSettings } from './types'
import type { MetricsProject, MetricsTimeEntry } from './billingMetrics'
import { entriesToMetrics } from './timeEntries'
import { isRevenueInvoice } from './taxes'
import { db as defaultDb, type FinanceDb } from './db'

export const TIME_ENTRY_SELECT =
  'entry_date, hours, rate_override, billable, invoice_id, project_id, description, time_entry_lines(hours, billable, item_name), projects(id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate, name, partners(legal_name))'

export const FIXED_PROJECT_SELECT =
  'id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate, name, partners(legal_name)'

export interface DashboardRawData {
  timeEntries: MetricsTimeEntry[]
  fixedProjects: MetricsProject[]
  partners: { id: string; legal_name: string }[]
}

export async function fetchDashboardBillingData(
  db: FinanceDb = defaultDb,
): Promise<DashboardRawData> {
  const [timeEntries, fixedProjects, partners] = await Promise.all([
    db.from('time_entries').select(TIME_ENTRY_SELECT),
    db.from('projects').select(FIXED_PROJECT_SELECT).eq('billing_type', 'fixed'),
    db.from('partners').select('id, legal_name').order('legal_name'),
  ])

  return {
    timeEntries: entriesToMetrics(timeEntries.data ?? []),
    fixedProjects: (fixedProjects.data ?? []) as MetricsProject[],
    partners: partners.data ?? [],
  }
}

export async function fetchExecutiveExtras(db: FinanceDb = defaultDb) {
  const [invoices, payments, lines] = await Promise.all([
    db.from('invoices').select('id, partner_id, subtotal, invoice_date, status'),
    db.from('payments').select('amount, payment_date, invoice_id'),
    db.from('invoice_line_items').select('invoice_id, subtotal, unit_label'),
  ])

  const allInvoices = invoices.data ?? []
  return {
    invoices: allInvoices.filter((i) => isRevenueInvoice(i.status)),
    payments: payments.data ?? [],
    lines: lines.data ?? [],
  }
}

export async function fetchOrganizationSettings(
  db: FinanceDb = defaultDb,
): Promise<OrganizationSettings | null> {
  const { data } = await db.from('organization_settings').select('*').maybeSingle()
  return data ?? null
}
