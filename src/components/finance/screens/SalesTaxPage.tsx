'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SalesTaxPeriod, TaxPeriodStatus } from '@/lib/finance/types'
import { formatCad, formatDate, todayIso } from '@/lib/finance/format'
import { matchesSearch, countActiveFilters } from '@/lib/finance/filters'
import { calculateSalesTaxPeriod, periodTaxableSupplies } from '@/lib/finance/salesTaxCalc'
import { buildGst34Worksheet, buildVd458Worksheet } from '@/lib/finance/taxReturns'
import { Badge } from '@/components/finance/Badge'
import { Button } from '@/components/finance/Button'
import { DeleteIconButton, EditIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { FilterSelect, ListToolbar } from '@/components/finance/ListToolbar'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

const empty = {
  period_start: todayIso().slice(0, 8) + '01',
  period_end: todayIso(),
  filing_due_date: '',
  gst_collected: 0,
  qst_collected: 0,
  gst_itc: 0,
  qst_itr: 0,
  status: 'open' as TaxPeriodStatus,
  notes: '',
}

function nets(gstC: number, qstC: number, gstI: number, qstI: number) {
  return { gst_net: gstC - gstI, qst_net: qstC - qstI }
}

export function SalesTaxPage() {
  const t = useTranslations('financeApp')
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<SalesTaxPeriod[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [worksheets, setWorksheets] = useState<{
    gst34: ReturnType<typeof buildGst34Worksheet>
    vd458: ReturnType<typeof buildVd458Worksheet>
  } | null>(null)

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      return matchesSearch(search, r.period_start, r.period_end, r.status, r.gst_net, r.qst_net, r.notes)
    })
  }, [rows, search, statusFilter])

  const hasFilters = !!(search || statusFilter)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await db.from('sales_tax_periods').select('*').order('period_end', { ascending: false })
    setRows((data as SalesTaxPeriod[]) ?? [])
  }

  async function calculateFromData() {
    const { totals, supplies } = await fetchPeriodTotals(form.period_start, form.period_end)
    setForm({ ...form, ...totals })
    setWorksheets({
      gst34: buildGst34Worksheet({ supplies, totals }),
      vd458: buildVd458Worksheet({ supplies, totals }),
    })
  }

  async function fetchPeriodTotals(periodStart: string, periodEnd: string) {
    const [inv, exp, ee] = await Promise.all([
      db.from('invoices').select('gst, qst, subtotal, invoice_date, status').gte('invoice_date', periodStart).lte('invoice_date', periodEnd),
      db.from('expenses').select('gst, qst, expense_date, category, payroll_run_id').gte('expense_date', periodStart).lte('expense_date', periodEnd),
      db.from('employee_expenses').select('gst, qst, expense_date, taxable, payroll_run_id').gte('expense_date', periodStart).lte('expense_date', periodEnd),
    ])
    const invoices = inv.data ?? []
    const totals = calculateSalesTaxPeriod(periodStart, periodEnd, invoices, exp.data ?? [], ee.data ?? [])
    const supplies = periodTaxableSupplies(periodStart, periodEnd, invoices)
    return { totals, supplies }
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.period_start, prior?.period_end, form.period_start, form.period_end)) return
    const { totals, supplies } = await fetchPeriodTotals(form.period_start, form.period_end)
    const { gst_net, qst_net } = nets(totals.gst_collected, totals.qst_collected, totals.gst_itc, totals.qst_itr)
    const payload = {
      ...form,
      ...totals,
      gst_net,
      qst_net,
      filing_due_date: form.filing_due_date || null,
      notes: form.notes || null,
      auto_synced_at: new Date().toISOString(),
    }
    if (editingId) await db.from('sales_tax_periods').update(payload).eq('id', editingId)
    else await db.from('sales_tax_periods').insert(payload)
    setWorksheets({
      gst34: buildGst34Worksheet({ supplies, totals }),
      vd458: buildVd458Worksheet({ supplies, totals }),
    })
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row && blockIfClosed(row.period_start, row.period_end)) return
    if (!confirm(t('salesTax.confirmDelete'))) return
    await db.from('sales_tax_periods').delete().eq('id', id)
    load()
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setWorksheets(null)
    setOpen(true)
  }

  function openEdit(r: SalesTaxPeriod) {
    setForm({
      period_start: r.period_start,
      period_end: r.period_end,
      filing_due_date: r.filing_due_date ?? '',
      gst_collected: Number(r.gst_collected),
      qst_collected: Number(r.qst_collected),
      gst_itc: Number(r.gst_itc),
      qst_itr: Number(r.qst_itr),
      status: r.status,
      notes: r.notes ?? '',
    })
    setEditingId(r.id)
    setWorksheets(null)
    setOpen(true)
  }

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('salesTax.title')}
        subtitle={t('salesTax.subtitle')}
        actions={<Button onClick={openNew}>{t('salesTax.new')}</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState message={t('salesTax.empty')} />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('salesTax.search')}
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, !!statusFilter)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('')
            }}
          >
            <FilterSelect
              label={t('salesTax.status')}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: t('common.all') },
                { value: 'open', label: t('salesTax.open') },
                { value: 'filed', label: t('salesTax.filed') },
                { value: 'paid', label: t('salesTax.paid') },
              ]}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message={t('salesTax.noneMatch')} />
          ) : (
        <DataTable>

            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3">{t('salesTax.period')}</th>
                <th className="px-4 py-3">{t('salesTax.netGst')}</th>
                <th className="px-4 py-3">{t('salesTax.netQst')}</th>
                <th className="px-4 py-3">{t('salesTax.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="group">
                  <td className="px-4 py-3">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                  <td className="px-4 py-3">{formatCad(r.gst_net)}</td>
                  <td className="px-4 py-3">{formatCad(r.qst_net)}</td>
                  <td className="px-4 py-3"><Badge label={r.status} tone={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <EditIconButton className={iconActionRevealClassName} label={t('common.edit')} onClick={() => openEdit(r)} />
                      <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => remove(r.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
          )}
        </>
      )}
      <Modal title={t('salesTax.modalTitle')} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('salesTax.start')}><input type="date" className={inputClass} required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></Field>
            <Field label={t('salesTax.end')}><input type="date" className={inputClass} required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></Field>
            <Field label={t('salesTax.filingDue')}><input type="date" className={inputClass} value={form.filing_due_date} onChange={(e) => setForm({ ...form, filing_due_date: e.target.value })} /></Field>
          </div>
          <Button type="button" variant="secondary" onClick={calculateFromData}>{t('salesTax.calcFromBooks')}</Button>
          {worksheets && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('salesTax.gst34Title')}</p>
                <div className="flex justify-between"><span>{t('salesTax.gst34Line101')}</span><span>{formatCad(worksheets.gst34.line101_supplies)}</span></div>
                <div className="flex justify-between"><span>{t('salesTax.gst34Line103')}</span><span>{formatCad(worksheets.gst34.line103_gstCollected)}</span></div>
                <div className="flex justify-between"><span>{t('salesTax.gst34Line106')}</span><span>{formatCad(worksheets.gst34.line106_itc)}</span></div>
                <div className="flex justify-between font-medium"><span>{t('salesTax.gst34Line109')}</span><span>{formatCad(worksheets.gst34.line109_net)}</span></div>
              </div>
              <div className="rounded-xl border border-border p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('salesTax.vd458Title')}</p>
                <div className="flex justify-between"><span>{t('salesTax.vd458Supplies')}</span><span>{formatCad(worksheets.vd458.totalTaxableSupplies)}</span></div>
                <div className="flex justify-between"><span>{t('salesTax.vd458Collected')}</span><span>{formatCad(worksheets.vd458.qstCollected)}</span></div>
                <div className="flex justify-between"><span>{t('salesTax.vd458Itr')}</span><span>{formatCad(worksheets.vd458.itr)}</span></div>
                <div className="flex justify-between font-medium"><span>{t('salesTax.vd458Net')}</span><span>{formatCad(worksheets.vd458.net)}</span></div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('salesTax.gstCollected')}><input type="number" step="0.01" className={inputClass} value={form.gst_collected} onChange={(e) => setForm({ ...form, gst_collected: Number(e.target.value) })} /></Field>
            <Field label={t('salesTax.qstCollected')}><input type="number" step="0.01" className={inputClass} value={form.qst_collected} onChange={(e) => setForm({ ...form, qst_collected: Number(e.target.value) })} /></Field>
            <Field label={t('salesTax.gstItc')}><input type="number" step="0.01" className={inputClass} value={form.gst_itc} onChange={(e) => setForm({ ...form, gst_itc: Number(e.target.value) })} /></Field>
            <Field label={t('salesTax.qstItr')}><input type="number" step="0.01" className={inputClass} value={form.qst_itr} onChange={(e) => setForm({ ...form, qst_itr: Number(e.target.value) })} /></Field>
          </div>
          <Field label={t('salesTax.status')}>
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaxPeriodStatus })}>
              <option value="open">open</option><option value="filed">filed</option><option value="paid">paid</option>
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
