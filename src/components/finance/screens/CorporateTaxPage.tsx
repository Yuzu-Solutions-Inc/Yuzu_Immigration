'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CorporateTaxRecord, CorpTaxStatus } from '@/lib/finance/types'
import { formatCad, formatDate } from '@/lib/finance/format'
import { matchesSearch, countActiveFilters } from '@/lib/finance/filters'
import { Badge } from '@/components/finance/Badge'
import { Button, tableActionClass } from '@/components/finance/Button'
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
  fiscal_year: '2025-2026',
  label: '',
  tax_authority: 'CRA',
  due_date: '',
  amount: 0,
  paid_amount: 0,
  paid_date: '',
  status: 'estimated' as CorpTaxStatus,
  notes: '',
}

export function CorporateTaxPage() {
  const t = useTranslations('financeApp')
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<CorporateTaxRecord[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fiscalYearFilter, setFiscalYearFilter] = useState('')

  const fiscalYears = useMemo(
    () => [...new Set(rows.map((r) => r.fiscal_year))].sort().reverse(),
    [rows]
  )

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (fiscalYearFilter && r.fiscal_year !== fiscalYearFilter) return false
      return matchesSearch(search, r.fiscal_year, r.label, r.tax_authority, r.status, r.amount, r.notes)
    })
  }, [rows, search, statusFilter, fiscalYearFilter])

  const hasFilters = !!(search || statusFilter || fiscalYearFilter)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await db.from('corporate_tax_records').select('*').order('due_date', { ascending: true })
    setRows((data as CorporateTaxRecord[]) ?? [])
  }

  function openNew() {
    setForm(empty)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(r: CorporateTaxRecord) {
    setForm({
      fiscal_year: r.fiscal_year,
      label: r.label,
      tax_authority: r.tax_authority,
      due_date: r.due_date ?? '',
      amount: Number(r.amount),
      paid_amount: Number(r.paid_amount),
      paid_date: r.paid_date ?? '',
      status: r.status,
      notes: r.notes ?? '',
    })
    setEditingId(r.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (
      blockIfClosed(
        prior?.due_date,
        prior?.paid_date,
        form.due_date || null,
        form.paid_date || null
      )
    ) {
      return
    }
    const payload = {
      ...form,
      due_date: form.due_date || null,
      paid_date: form.paid_date || null,
      notes: form.notes || null,
    }
    if (editingId) await db.from('corporate_tax_records').update(payload).eq('id', editingId)
    else await db.from('corporate_tax_records').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row && blockIfClosed(row.due_date, row.paid_date)) return
    if (!confirm(t('corporateTax.confirmDelete'))) return
    await db.from('corporate_tax_records').delete().eq('id', id)
    load()
  }

  const due = filtered.filter((r) => r.status !== 'paid').reduce((s, r) => s + Number(r.amount) - Number(r.paid_amount), 0)

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('corporateTax.title')}
        subtitle={t('corporateTax.subtitleDue', { filtered: hasFilters ? ` ${t('common.filtered')}` : '', amount: formatCad(due) })}
        actions={<Button onClick={openNew}>{t('corporateTax.new')}</Button>}
      />
      {rows.length === 0 ? (
        <EmptyState message={t('corporateTax.empty')} />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('corporateTax.search')}
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(!!search, !!statusFilter, !!fiscalYearFilter)}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('')
              setFiscalYearFilter('')
            }}
          >
            <FilterSelect
              label={t('corporateTax.fiscalYear')}
              value={fiscalYearFilter}
              onChange={setFiscalYearFilter}
              options={[{ value: '', label: t('corporateTax.allYears') }, ...fiscalYears.map((y) => ({ value: y, label: y }))]}
            />
            <FilterSelect
              label={t('corporateTax.status')}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: '', label: t('corporateTax.allStatuses') },
                { value: 'estimated', label: t('corporateTax.estimated') },
                { value: 'due', label: t('corporateTax.dueStatus') },
                { value: 'paid', label: t('corporateTax.paid') },
              ]}
            />
          </ListToolbar>
          {filtered.length === 0 ? (
            <EmptyState message={t('corporateTax.noneMatch')} />
          ) : (
        <DataTable>

            <thead className="bg-muted text-muted-foreground text-left">
              <tr>
                <th className="px-4 py-3">{t('corporateTax.fiscalYear')}</th>
                <th className="px-4 py-3">{t('corporateTax.description')}</th>
                <th className="px-4 py-3">{t('corporateTax.authority')}</th>
                <th className="px-4 py-3">{t('corporateTax.due')}</th>
                <th className="px-4 py-3">{t('corporateTax.amount')}</th>
                <th className="px-4 py-3">{t('corporateTax.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.fiscal_year}</td>
                  <td className="px-4 py-3 font-medium">{r.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.tax_authority}</td>
                  <td className="px-4 py-3">{r.due_date ? formatDate(r.due_date) : t('common.dash')}</td>
                  <td className="px-4 py-3">{formatCad(r.amount)}</td>
                  <td className="px-4 py-3"><Badge label={r.status} tone={r.status === 'paid' ? 'paid' : 'draft'} /></td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(r)}>{t('common.editShort')}</Button>
                    <Button variant="danger" className={tableActionClass} onClick={() => remove(r.id)}>{t('common.deleteShort')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
        </DataTable>
          )}
        </>
      )}
      <Modal title={t('corporateTax.modalTitle')} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('corporateTax.fiscalYearStar')}><input className={inputClass} required value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} placeholder="2025-2026" /></Field>
            <Field label={t('corporateTax.authority')}><select className={inputClass} value={form.tax_authority} onChange={(e) => setForm({ ...form, tax_authority: e.target.value })}><option value="CRA">{t('corporateTax.cra')}</option><option value="RQ">{t('corporateTax.rq')}</option></select></Field>
          </div>
          <Field label={t('corporateTax.descriptionStar')}><input className={inputClass} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('corporateTax.instalmentPlaceholder')} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={t('corporateTax.due')}><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label={t('corporateTax.amountStar')}><input type="number" step="0.01" className={inputClass} required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
            <Field label={t('corporateTax.paid')}><input type="number" step="0.01" className={inputClass} value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: Number(e.target.value) })} /></Field>
          </div>
          <Field label={t('corporateTax.status')}>
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CorpTaxStatus })}>
              <option value="estimated">estimated</option><option value="due">due</option><option value="paid">paid</option>
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
