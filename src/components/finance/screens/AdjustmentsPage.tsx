'use client'

import { useEffect, useState } from 'react'
import type { AccountingAdjustment, AdjustmentType } from '@/lib/finance/types'
import { CHART_OF_ACCOUNTS } from '@/lib/finance/chartOfAccounts'
import { formatCad, formatDate, todayIso } from '@/lib/finance/format'
import { Button, tableActionClass } from '@/components/finance/Button'
import { DeleteIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

const typeKeys: Record<AdjustmentType, string> = {
  prepaid: 'adjustments.prepaid',
  accrual: 'adjustments.accrual',
  depreciation: 'adjustments.depreciation',
  manual: 'adjustments.manual',
}

function emptyForm(type: AdjustmentType = 'prepaid') {
  const base = {
    adjustment_type: type,
    description: '',
    start_date: todayIso(),
    end_date: '',
    total_amount: 0,
    monthly_amount: 0,
    active: true,
    notes: '',
  }
  switch (type) {
    case 'manual':
      return { ...base, debit_account: '1010', credit_account: '3000' }
    case 'accrual':
      return { ...base, debit_account: '5090', credit_account: '2000' }
    case 'depreciation':
      return { ...base, debit_account: '5200', credit_account: '1500' }
    case 'prepaid':
    default:
      return { ...base, debit_account: '5090', credit_account: '1400' }
  }
}

export function AdjustmentsPage() {
  const t = useTranslations('financeApp')
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<AccountingAdjustment[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saveError, setSaveError] = useState<string | null>(null)

  const isManual = form.adjustment_type === 'manual'

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data, error } = await db.from('accounting_adjustments').select('*').order('start_date', { ascending: false })
    if (error) {
      setSaveError(
        error.message.includes('accounting_adjustments')
          ? t('adjustments.missingTable')
          : error.message
      )
      setRows([])
      return
    }
    setSaveError(null)
    setRows((data as AccountingAdjustment[]) ?? [])
  }

  function setAdjustmentType(type: AdjustmentType) {
    setForm((prev) => ({
      ...emptyForm(type),
      description: prev.description,
      start_date: prev.start_date,
      end_date: prev.end_date,
      notes: prev.notes,
    }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)

    if (isManual && Number(form.total_amount) <= 0) {
      setSaveError(t('adjustments.needTotal'))
      return
    }
    if (!isManual && Number(form.monthly_amount) <= 0) {
      setSaveError(t('adjustments.needMonthly'))
      return
    }
    if (blockIfClosed(form.start_date, form.end_date)) return

    const { error } = await db.from('accounting_adjustments').insert({
      adjustment_type: form.adjustment_type,
      description: form.description,
      start_date: form.start_date,
      end_date: form.end_date || null,
      total_amount: isManual ? form.total_amount : null,
      monthly_amount: isManual ? null : form.monthly_amount,
      debit_account: form.debit_account,
      credit_account: form.credit_account,
      active: form.active,
      notes: form.notes || null,
    })

    if (error) {
      setSaveError(error.message)
      return
    }

    setOpen(false)
    setForm(emptyForm())
    load()
  }

  async function toggleActive(r: AccountingAdjustment) {
    if (blockIfClosed(r.start_date, r.end_date)) return
    await db.from('accounting_adjustments').update({ active: !r.active }).eq('id', r.id)
    load()
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row && blockIfClosed(row.start_date, row.end_date)) return
    if (!confirm(t('adjustments.confirmDelete'))) return
    await db.from('accounting_adjustments').delete().eq('id', id)
    load()
  }

  const accountOptions = CHART_OF_ACCOUNTS.map((a) => (
    <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
  ))

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('adjustments.title')}
        subtitle={t('adjustments.subtitle')}
        actions={<Button onClick={() => { setSaveError(null); setOpen(true) }}>{t('adjustments.new')}</Button>}
      />

      {saveError && !open && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>
      )}

      {rows.length === 0 ? (
        <EmptyState message={t('adjustments.empty')} />
      ) : (
        <DataTable>
          <thead className="bg-muted text-muted-foreground text-left text-sm">
            <tr>
              <th className="px-4 py-3">{t('adjustments.start')}</th>
              <th className="px-4 py-3">{t('adjustments.end')}</th>
              <th className="px-4 py-3">{t('adjustments.type')}</th>
              <th className="px-4 py-3">{t('adjustments.description')}</th>
              <th className="px-4 py-3">{t('adjustments.accounts')}</th>
              <th className="px-4 py-3 text-right">{t('adjustments.amount')}</th>
              <th className="px-4 py-3">{t('adjustments.active')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-sm">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">{formatDate(r.start_date)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.end_date ? formatDate(r.end_date) : t('common.dash')}</td>
                <td className="px-4 py-3">{t(typeKeys[r.adjustment_type])}</td>
                <td className="px-4 py-3">{r.description}</td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {r.debit_account} → {r.credit_account}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.total_amount != null ? formatCad(r.total_amount) : r.monthly_amount != null ? `${formatCad(r.monthly_amount)}/mois` : t('common.dash')}
                </td>
                <td className="px-4 py-3">{r.active ? t('common.yes') : t('common.no')}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button variant="ghost" className={tableActionClass} onClick={() => toggleActive(r)}>
                      {r.active ? t('common.deactivate') : t('common.activate')}
                    </Button>
                    <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => remove(r.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title={t('adjustments.new')} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label={t('adjustments.type')}>
            <select
              className={inputClass}
              value={form.adjustment_type}
              onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
            >
              {(Object.keys(typeKeys) as AdjustmentType[]).map((value) => (
                <option key={value} value={value}>{t(typeKeys[value])}</option>
              ))}
            </select>
          </Field>
          {isManual && (
            <p className="text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
              {t('adjustments.capitalHint')}
            </p>
          )}
          <Field label={t('adjustments.descriptionStar')}>
            <input className={inputClass} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('adjustments.startDate')}>
              <input type="date" className={inputClass} required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label={t('adjustments.endDate')}>
              <input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          {isManual ? (
            <Field label={t('adjustments.totalCad')}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={inputClass}
                required
                value={form.total_amount || ''}
                onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })}
              />
            </Field>
          ) : (
            <Field label={t('adjustments.monthlyCad')}>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={inputClass}
                required
                value={form.monthly_amount || ''}
                onChange={(e) => setForm({ ...form, monthly_amount: Number(e.target.value) })}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('adjustments.debitAccount')}>
              <select className={inputClass} value={form.debit_account} onChange={(e) => setForm({ ...form, debit_account: e.target.value })}>{accountOptions}</select>
            </Field>
            <Field label={t('adjustments.creditAccount')}>
              <select className={inputClass} value={form.credit_account} onChange={(e) => setForm({ ...form, credit_account: e.target.value })}>{accountOptions}</select>
            </Field>
          </div>
          <Field label={t('adjustments.notes')}>
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {saveError && <p className="text-sm text-red-700">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
