'use client'

import { useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import type { Employee, PayFrequency } from '@/lib/finance/types'
import { formatCad } from '@/lib/finance/format'
import { employeeDisplayName, grossPerPeriod, payFrequencyLabel, periodsPerYear } from '@/lib/finance/payrollCalc'
import { CA_PROVINCES } from '@/lib/sage/tax-regions'
import { Badge } from '@/components/finance/Badge'
import { Button } from '@/components/finance/Button'
import { DeleteIconButton, EditIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { PageHeader } from '@/components/finance/PageHeader'
import { db } from '@/lib/finance/db'
import { fetchEmployeesScreen, type EmployeesScreenData } from '@/lib/finance/screen-data'
import { useTranslations } from 'next-intl'

type CompensationOutletContext = { refreshMetrics?: () => void }

const emptyEmployee = {
  first_name: '',
  last_name: '',
  email: '',
  yearly_salary: 0,
  pay_frequency: 'biweekly' as PayFrequency,
  estimated_yearly_income: '',
  active: true,
  hire_date: '',
  notes: '',
  over_40_percent_voting: false,
  province_of_employment: 'QC',
  td1_federal_claim: '',
  td1_provincial_claim: '',
}

export function EmployeesPage({ initial }: { initial?: EmployeesScreenData }) {
  const t = useTranslations('financeApp')
  const { refreshMetrics } = useFinanceOutlet<CompensationOutletContext>() ?? {}
  const [employees, setEmployees] = useState<Employee[]>(initial?.employees ?? [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyEmployee)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (initial) return
    void load()
  }, [])

  async function load() {
    const data = await fetchEmployeesScreen(db)
    setEmployees(data.employees)
    refreshMetrics?.()
  }

  function openNew() {
    setForm(emptyEmployee)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(e: Employee) {
    setForm({
      first_name: e.first_name,
      last_name: e.last_name,
      email: e.email ?? '',
      yearly_salary: Number(e.yearly_salary),
      pay_frequency: e.pay_frequency,
      estimated_yearly_income: e.estimated_yearly_income != null ? String(e.estimated_yearly_income) : '',
      active: e.active,
      hire_date: e.hire_date ?? '',
      notes: e.notes ?? '',
      over_40_percent_voting: Boolean(e.over_40_percent_voting),
      province_of_employment: e.province_of_employment ?? 'QC',
      td1_federal_claim: e.td1_federal_claim != null ? String(e.td1_federal_claim) : '',
      td1_provincial_claim: e.td1_provincial_claim != null ? String(e.td1_provincial_claim) : '',
    })
    setEditingId(e.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    const payload = {
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      yearly_salary: form.yearly_salary,
      pay_frequency: form.pay_frequency,
      estimated_yearly_income: form.estimated_yearly_income ? Number(form.estimated_yearly_income) : null,
      active: form.active,
      hire_date: form.hire_date || null,
      notes: form.notes || null,
      over_40_percent_voting: form.over_40_percent_voting,
      province_of_employment: form.province_of_employment || 'QC',
      td1_federal_claim: form.td1_federal_claim ? Number(form.td1_federal_claim) : null,
      td1_provincial_claim: form.td1_provincial_claim ? Number(form.td1_provincial_claim) : null,
    }
    if (editingId) await db.from('employees').update(payload).eq('id', editingId)
    else await db.from('employees').insert(payload)
    setOpen(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm(t('employees.confirmDelete'))) return
    await db.from('employees').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <PageHeader
        title={t('employees.title')}
        subtitle={
          <>
            Fiche salariale requise pour la paie, le temps et les dividendes.{' '}
            <Link href="/compensation/payroll" className="text-brand hover:underline">
              {t('employees.back')}
            </Link>
          </>
        }
        actions={<Button onClick={openNew}>{t('employees.new')}</Button>}
      />

      {employees.length === 0 ? (
        <EmptyState message={t('employees.empty')} />
      ) : (
        <DataTable>
          <thead className="bg-muted text-muted-foreground text-left">
            <tr>
              <th className="px-4 py-3">{t('employees.name')}</th>
              <th className="px-4 py-3">{t('employees.yearlySalary')}</th>
              <th className="px-4 py-3">{t('employees.frequency')}</th>
              <th className="px-4 py-3">{t('employees.grossPerPeriod')}</th>
              <th className="px-4 py-3">{t('employees.estIncome')}</th>
              <th className="px-4 py-3">{t('employees.province')}</th>
              <th className="px-4 py-3">{t('employees.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.map((e) => (
              <tr key={e.id} className="group">
                <td className="px-4 py-3 font-medium">{employeeDisplayName(e)}</td>
                <td className="px-4 py-3">{formatCad(e.yearly_salary)}</td>
                <td className="px-4 py-3 text-muted-foreground">{payFrequencyLabel(e.pay_frequency)}</td>
                <td className="px-4 py-3">{formatCad(grossPerPeriod(Number(e.yearly_salary), e.pay_frequency))}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {e.estimated_yearly_income != null ? formatCad(e.estimated_yearly_income) : t('common.dash')}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.province_of_employment ?? 'QC'}</td>
                <td className="px-4 py-3">
                  <Badge label={e.active ? t('employees.active') : t('employees.inactive')} tone={e.active ? 'active' : 'archived'} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <EditIconButton className={iconActionRevealClassName} label={t('common.edit')} onClick={() => openEdit(e)} />
                    <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => remove(e.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal title={editingId ? t('employees.edit') : t('employees.new')} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('employees.firstName')}>
              <input className={inputClass} required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </Field>
            <Field label={t('employees.lastName')}>
              <input className={inputClass} required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Field>
          </div>
          <Field label={t('employees.email')}>
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('employees.yearlySalaryCad')}>
              <input type="number" step="0.01" min="0" className={inputClass} required value={form.yearly_salary} onChange={(e) => setForm({ ...form, yearly_salary: Number(e.target.value) })} />
            </Field>
            <Field label={t('employees.payFrequency')}>
              <select className={inputClass} value={form.pay_frequency} onChange={(e) => setForm({ ...form, pay_frequency: e.target.value as PayFrequency })}>
                <option value="weekly">{t('employees.freqWeekly')}</option>
                <option value="biweekly">{t('employees.freqBiweekly')}</option>
                <option value="semimonthly">{t('employees.freqSemimonthly')}</option>
                <option value="monthly">{t('employees.freqMonthly')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('employees.estIncomeOptional')}>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              placeholder={t('employees.leaveEmpty')}
              value={form.estimated_yearly_income}
              onChange={(e) => setForm({ ...form, estimated_yearly_income: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('employees.otherIncomeHint')}
            </p>
          </Field>
          {form.yearly_salary > 0 && (
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground">
              Brut par période :{' '}
              <strong className="text-foreground">{formatCad(grossPerPeriod(form.yearly_salary, form.pay_frequency))}</strong>
              {' · '}
              {periodsPerYear(form.pay_frequency)} paies / an
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('employees.hireDate')}>
              <input type="date" className={inputClass} value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            </Field>
            <Field label={t('employees.status')}>
              <select className={inputClass} value={form.active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}>
                <option value="yes">{t('employees.active')}</option>
                <option value="no">{t('employees.inactive')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('employees.provinceOfEmployment')}>
            <select
              className={inputClass}
              value={form.province_of_employment}
              onChange={(e) => setForm({ ...form, province_of_employment: e.target.value })}
            >
              {CA_PROVINCES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('employees.td1Federal')}>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                placeholder={t('employees.td1Default')}
                value={form.td1_federal_claim}
                onChange={(e) => setForm({ ...form, td1_federal_claim: e.target.value })}
              />
            </Field>
            <Field label={t('employees.td1Provincial')}>
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                placeholder={t('employees.td1Default')}
                value={form.td1_provincial_claim}
                onChange={(e) => setForm({ ...form, td1_provincial_claim: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{t('employees.td1Hint')}</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.over_40_percent_voting}
              onChange={(e) => setForm({ ...form, over_40_percent_voting: e.target.checked })}
            />
            <span>
              {t('employees.over40')}
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t('employees.over40Hint')}
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
