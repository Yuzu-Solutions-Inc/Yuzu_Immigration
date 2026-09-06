'use client'

import { useEffect, useState } from 'react'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import type { Employee, Shareholder } from '@/lib/finance/types'
import { employeeDisplayName } from '@/lib/finance/payrollCalc'
import { Badge } from '@/components/finance/Badge'
import { Button, tableActionClass } from '@/components/finance/Button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { PageHeader } from '@/components/finance/PageHeader'
import { AlertBanner } from '@/components/finance/AlertBanner'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

type CompensationOutletContext = { refreshMetrics?: () => void }

const emptyShareholder = {
  legal_name: '',
  email: '',
  employee_id: '',
  shares_held: 1,
  active: true,
  notes: '',
}

export function ShareholdersPage() {
  const t = useTranslations('financeApp')
  const { refreshMetrics } = useFinanceOutlet<CompensationOutletContext>() ?? {}
  const [rows, setRows] = useState<Shareholder[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyShareholder)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoadError(null)
    const [sh, emp] = await Promise.all([
      db.from('shareholders').select('*, employees(first_name, last_name)').order('legal_name'),
      db.from('employees').select('id, first_name, last_name, active').eq('active', true).order('last_name'),
    ])
    if (sh.error?.message.includes('shareholders')) {
      setLoadError(t('shareholders.missingTable'))
      setRows([])
    } else {
      setRows((sh.data as Shareholder[]) ?? [])
    }
    setEmployees((emp.data as Employee[]) ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    setForm(emptyShareholder)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(s: Shareholder) {
    setForm({
      legal_name: s.legal_name,
      email: s.email ?? '',
      employee_id: s.employee_id ?? '',
      shares_held: Number(s.shares_held),
      active: s.active,
      notes: s.notes ?? '',
    })
    setEditingId(s.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      legal_name: form.legal_name,
      email: form.email || null,
      employee_id: form.employee_id || null,
      shares_held: form.shares_held,
      active: form.active,
      notes: form.notes || null,
    }
    if (editingId) await db.from('shareholders').update(payload).eq('id', editingId)
    else await db.from('shareholders').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm(t('shareholders.confirmDelete'))) return
    await db.from('shareholders').delete().eq('id', id)
    load()
  }

  const activeCount = rows.filter((s) => s.active).length

  return (
    <>
      <PageHeader
        title={t('shareholders.title')}
        subtitle={t('shareholders.subtitle')}
        actions={<Button onClick={openNew}>{t('shareholders.add')}</Button>}
      />

      {loadError && <AlertBanner>{loadError}</AlertBanner>}

      {activeCount === 0 && !loadError && (
        <AlertBanner>
          {t('shareholders.noActive')}
        </AlertBanner>
      )}

      {rows.length === 0 ? (
        <EmptyState message={t('shareholders.empty')} />
      ) : (
        <DataTable>
          <thead className="bg-muted text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3">{t('shareholders.legalName')}</th>
              <th className="px-4 py-3">{t('shareholders.shares')}</th>
              <th className="px-4 py-3">{t('shareholders.linkedEmployee')}</th>
              <th className="px-4 py-3">{t('shareholders.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">{s.legal_name}</td>
                <td className="px-4 py-3">{Number(s.shares_held)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {s.employees ? employeeDisplayName(s.employees) : t('common.dash')}
                </td>
                <td className="px-4 py-3">
                  <Badge label={s.active ? t('shareholders.active') : t('common.inactive')} tone={s.active ? 'paid' : 'draft'} />
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(s)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" className={tableActionClass} onClick={() => remove(s.id)}>
                    {t('common.deleteShort')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title={editingId ? t('shareholders.edit') : t('shareholders.new')} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <Field label={t('shareholders.legalNameStar')}>
            <input className={inputClass} required value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </Field>
          <Field label={t('shareholders.email')}>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t('shareholders.sharesHeld')}>
            <input type="number" step="0.0001" min="0.0001" className={inputClass} required value={form.shares_held} onChange={(e) => setForm({ ...form, shares_held: Number(e.target.value) })} />
          </Field>
          <Field label={t('shareholders.linkedOptional')}>
            <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">{t('common.dash')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeDisplayName(e)}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            {t('shareholders.active')}
          </label>
          <Field label={t('shareholders.notes')}>
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <p className="text-xs text-muted-foreground mt-4">
        {t('shareholders.draftNote')}
      </p>
    </>
  )
}
