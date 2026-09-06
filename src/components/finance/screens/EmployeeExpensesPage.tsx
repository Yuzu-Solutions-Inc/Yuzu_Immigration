'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import type { Employee, EmployeeExpense, ExpenseCategory, OrganizationSettings } from '@/lib/finance/types'
import { formatCad, formatDate, relationOne, todayIso } from '@/lib/finance/format'
import { inDateRange, matchesSearch, countActiveFilters } from '@/lib/finance/filters'
import { round2, splitPurchaseAmount, splitPurchaseTotal } from '@/lib/finance/taxes'
import { employeeDisplayName } from '@/lib/finance/payrollCalc'
import { EXPENSE_CATEGORY_LABELS } from '@/lib/finance/chartOfAccounts'
import { deleteEntityDocuments, uploadDocument } from '@/lib/finance/documents'
import type { ReceiptPurchaseFields } from '@/lib/finance/receiptOcr'
import { Badge } from '@/components/finance/Badge'
import { Button } from '@/components/finance/Button'
import { DeleteIconButton, EditIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { DataTable } from '@/components/finance/DataTable'
import { DocumentAttachments } from '@/components/finance/DocumentAttachments'
import { ReceiptScanField } from '@/components/finance/ReceiptScanField'
import { Modal } from '@/components/finance/Modal'
import { NumberInput } from '@/components/finance/NumberInput'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { DateRangeFilter, FilterChips, FilterSelect, ListToolbar } from '@/components/finance/ListToolbar'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { db } from '@/lib/finance/db'
import {
  fetchEmployeeExpensesScreen,
  type EmployeeExpensesScreenData,
} from '@/lib/finance/screen-data'
import { useTranslations } from 'next-intl'

const CATEGORIES: ExpenseCategory[] = [
  'software',
  'office',
  'travel',
  'professional',
  'marketing',
  'insurance',
  'other',
]

/** Which amount field drives auto tax calculation. */
type TaxEntryMode = 'total' | 'amount'

type Filter = 'all' | 'unreimbursed' | 'reimbursed'

const empty = {
  employee_id: '',
  expense_date: todayIso(),
  vendor: '',
  category: 'other' as ExpenseCategory,
  description: '',
  total: 0,
  amount: 0,
  gst: 0,
  qst: 0,
  applyTax: true,
  taxable: false,
  notes: '',
}

export function EmployeeExpensesPage({ initial }: { initial?: EmployeeExpensesScreenData }) {
  const t = useTranslations('financeApp')
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<EmployeeExpense[]>(initial?.rows ?? [])
  const [employees, setEmployees] = useState<Employee[]>(initial?.employees ?? [])
  const [settings, setSettings] = useState<OrganizationSettings | null>(initial?.settings ?? null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Filter>('all')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [taxEntryMode, setTaxEntryMode] = useState<TaxEntryMode>('total')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees])
  const defaultEmployeeId = activeEmployees.length === 1 ? activeEmployees[0].id : ''

  const filtered = useMemo(() => {
    return rows.filter((e) => {
      if (statusFilter === 'unreimbursed' && e.payroll_run_id) return false
      if (statusFilter === 'reimbursed' && !e.payroll_run_id) return false
      if (employeeFilter && e.employee_id !== employeeFilter) return false
      if (categoryFilter && e.category !== categoryFilter) return false
      if (!inDateRange(e.expense_date, dateFrom, dateTo)) return false
      const emp = relationOne(e.employees)
      return matchesSearch(
        search,
        e.vendor,
        e.description,
        e.category,
        e.notes,
        e.total,
        emp ? employeeDisplayName(emp) : ''
      )
    })
  }, [rows, search, statusFilter, employeeFilter, categoryFilter, dateFrom, dateTo])

  const hasFilters = !!(search || statusFilter !== 'all' || employeeFilter || categoryFilter || dateFrom || dateTo)
  const unreimbursedTotal = rows.filter((e) => !e.payroll_run_id).reduce((s, e) => s + Number(e.total), 0)

  useEffect(() => {
    if (initial) return
    void load()
  }, [])

  useEffect(() => {
    if (!open || !form.applyTax) return
    setForm((prev) => {
      const taxes =
        taxEntryMode === 'amount'
          ? splitPurchaseAmount(prev.amount, prev.applyTax, settings)
          : splitPurchaseTotal(prev.total, prev.applyTax, settings)
      if (
        prev.amount === taxes.amount &&
        prev.gst === taxes.gst &&
        prev.qst === taxes.qst &&
        prev.total === taxes.total
      ) {
        return prev
      }
      return { ...prev, ...taxes }
    })
  }, [open, settings, form.applyTax, taxEntryMode])

  async function load() {
    const data = await fetchEmployeeExpensesScreen(db)
    setRows(data.rows)
    setEmployees(data.employees)
    setSettings(data.settings)
  }

  function onTotalChange(total: number) {
    setTaxEntryMode('total')
    setForm((prev) => {
      const taxes = splitPurchaseTotal(total, prev.applyTax, settings)
      return { ...prev, ...taxes }
    })
  }

  function onAmountChange(amount: number) {
    setTaxEntryMode('amount')
    setForm((prev) => {
      const taxes = splitPurchaseAmount(amount, prev.applyTax, settings)
      return { ...prev, ...taxes }
    })
  }

  function onTaxToggle(applyTax: boolean) {
    setForm((prev) => {
      const taxes =
        taxEntryMode === 'amount'
          ? splitPurchaseAmount(prev.amount, applyTax, settings)
          : splitPurchaseTotal(prev.total, applyTax, settings)
      return { ...prev, applyTax, ...taxes }
    })
  }

  function onReceiptExtracted(fields: ReceiptPurchaseFields) {
    setTaxEntryMode('total')
    setForm((prev) => ({
      ...prev,
      vendor: fields.vendor ?? prev.vendor,
      expense_date: fields.expense_date ?? prev.expense_date,
      description: fields.description ?? prev.description,
      amount: fields.amount,
      gst: fields.gst,
      qst: fields.qst,
      total: fields.total,
      applyTax: fields.applyTax,
    }))
  }

  function openNew() {
    setForm({ ...empty, employee_id: defaultEmployeeId })
    setTaxEntryMode('total')
    setReceiptFile(null)
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(e: EmployeeExpense) {
    if (e.payroll_run_id) {
      alert('Frais déjà remboursé — modification limitée.')
      return
    }
    setForm({
      employee_id: e.employee_id,
      expense_date: e.expense_date,
      vendor: e.vendor,
      category: e.category,
      description: e.description ?? '',
      total: Number(e.total),
      amount: Number(e.amount),
      gst: Number(e.gst),
      qst: Number(e.qst),
      applyTax: Number(e.gst) > 0 || Number(e.qst) > 0,
      taxable: e.taxable,
      notes: e.notes ?? '',
    })
    setTaxEntryMode('total')
    setReceiptFile(null)
    setEditingId(e.id)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form.employee_id) {
      alert('Sélectionnez un employé.')
      return
    }
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.expense_date, form.expense_date)) return
    const taxes = form.applyTax
      ? taxEntryMode === 'amount'
        ? splitPurchaseAmount(form.amount, true, settings)
        : splitPurchaseTotal(form.total, true, settings)
      : { amount: round2(form.total || form.amount), gst: 0, qst: 0, total: round2(form.total || form.amount) }
    const payload = {
      employee_id: form.employee_id,
      expense_date: form.expense_date,
      vendor: form.vendor,
      category: form.category,
      description: form.description || null,
      amount: taxes.amount,
      gst: taxes.gst,
      qst: taxes.qst,
      total: taxes.total,
      taxable: form.taxable,
      notes: form.notes || null,
    }
    try {
      let entityId = editingId
      if (editingId) {
        const { error } = await db.from('employee_expenses').update(payload).eq('id', editingId)
        if (error) {
          alert(error.message)
          return
        }
      } else {
        const { data, error } = await db.from('employee_expenses').insert(payload).select('id').single()
        if (error) {
          alert(error.message)
          return
        }
        entityId = data.id
        setEditingId(data.id)
      }
      if (receiptFile && entityId) {
        await uploadDocument(
          receiptFile,
          receiptFile.name,
          receiptFile.type ||
            (receiptFile.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : receiptFile.type),
          'employee_expense',
          entityId
        )
        setReceiptFile(null)
      }
      if (editingId) setOpen(false)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur d’enregistrement.')
    }
  }

  async function remove(e: EmployeeExpense) {
    if (e.payroll_run_id) {
      alert('Impossible de supprimer un frais déjà remboursé.')
      return
    }
    if (!confirm(t('employeeExpenses.confirmDelete'))) return
    if (blockIfClosed(e.expense_date)) return
    await deleteEntityDocuments('employee_expense', e.id)
    await db.from('employee_expenses').delete().eq('id', e.id)
    load()
  }

  const total = filtered.reduce((s, e) => s + Number(e.total), 0)

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('employeeExpenses.title')}
        subtitle={
          <>
            {t('employeeExpenses.subtitlePaid')}{' '}
            <Link href="/compensation/payroll" className="text-brand hover:underline font-medium">
              {t('employeeExpenses.payrollLink')}
            </Link>
            .
            {unreimbursedTotal > 0 && (
              <> {t('employeeExpenses.pending', { amount: formatCad(unreimbursedTotal) })}</>
            )}
            {' · '}
            Total{hasFilters ? ' (filtré)' : ''} : {formatCad(total)}
          </>
        }
        actions={
          <Button onClick={openNew} disabled={activeEmployees.length === 0}>
            {t('employeeExpenses.new')}
          </Button>
        }
      />

      {activeEmployees.length === 0 ? (
        <EmptyState message={t('employeeExpenses.emptyNeedEmployee')} />
      ) : rows.length === 0 ? (
        <EmptyState message={t('employeeExpenses.empty')} />
      ) : (
        <>
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Fournisseur, description…"
            resultCount={filtered.length}
            totalCount={rows.length}
            activeFilterCount={countActiveFilters(
              !!search,
              statusFilter !== 'all',
              !!employeeFilter,
              !!categoryFilter,
              !!dateFrom,
              !!dateTo
            )}
            clearVisible={hasFilters}
            onClearFilters={() => {
              setSearch('')
              setStatusFilter('all')
              setEmployeeFilter('')
              setCategoryFilter('')
              setDateFrom('')
              setDateTo('')
            }}
          >
            <FilterChips
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'unreimbursed', label: 'À rembourser' },
                { value: 'reimbursed', label: 'Remboursé' },
              ]}
            />
            <FilterSelect
              label="Employé"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={[
                { value: '', label: 'Tous' },
                ...activeEmployees.map((e) => ({ value: e.id, label: employeeDisplayName(e) })),
              ]}
            />
            <FilterSelect
              label="Catégorie"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Toutes' },
                ...CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] })),
              ]}
            />
            <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          </ListToolbar>

          {filtered.length === 0 ? (
            <EmptyState message={t('employeeExpenses.noneMatch')} />
          ) : (
            <DataTable>
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employé</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Imposable</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => {
                  const emp = relationOne(e.employees)
                  const pay = relationOne(e.payroll_runs)
                  return (
                    <tr key={e.id} className="group">
                      <td className="px-4 py-3">{formatDate(e.expense_date)}</td>
                      <td className="px-4 py-3">{emp ? employeeDisplayName(emp) : '—'}</td>
                      <td className="px-4 py-3 font-medium">{e.vendor}</td>
                      <td className="px-4 py-3">
                        <Badge label={EXPENSE_CATEGORY_LABELS[e.category] ?? e.category} />
                      </td>
                      <td className="px-4 py-3">{formatCad(e.total)}</td>
                      <td className="px-4 py-3">{e.taxable ? t('common.yes') : t('common.no')}</td>
                      <td className="px-4 py-3">
                        {e.payroll_run_id ? (
                          <Badge label={pay ? `Paie ${formatDate(pay.payment_date)}` : 'Remboursé'} tone="active" />
                        ) : (
                          <Badge label="À rembourser" tone="draft" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <EditIconButton className={iconActionRevealClassName} label={t('common.edit')} onClick={() => openEdit(e)} />
                          <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => remove(e)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      <Modal title={editingId ? t('employeeExpenses.edit') : t('employeeExpenses.new')} open={open} onClose={() => setOpen(false)} wide>
        <form onSubmit={save} className="space-y-3">
          <ReceiptScanField
            file={receiptFile}
            onFileChange={setReceiptFile}
            onExtracted={onReceiptExtracted}
            applyTax={form.applyTax}
            settings={settings}
            label="Reçu / facture"
            hint="PDF ou image (max 10 Mo). Joint au frais à l’enregistrement."
            disabled={!!(editingId && rows.find((r) => r.id === editingId)?.payroll_run_id)}
          />
          <Field label={t('common.employee')}>
            <select
              className={inputClass}
              required
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            >
              <option value="">—</option>
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeDisplayName(e)}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Date *">
              <input
                type="date"
                className={inputClass}
                required
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
              />
            </Field>
            <Field label="Fournisseur *">
              <input
                className={inputClass}
                required
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Catégorie">
            <select
              className={inputClass}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.applyTax} onChange={(e) => onTaxToggle(e.target.checked)} />
            Calculer TPS/TVQ (Québec) — saisie TTC ou HT
          </label>
          {!settings && form.applyTax && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Paramètres société non chargés — taux Québec par défaut (TPS 5 %, TVQ 9,975 %).
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Total TTC *">
              <NumberInput
                step="0.01"
                min="0"
                required
                value={form.total}
                onChange={onTotalChange}
              />
            </Field>
            <Field label="Montant HT">
              <NumberInput
                step="0.01"
                min="0"
                value={form.amount}
                onChange={onAmountChange}
              />
            </Field>
            <Field label="TPS (CTI)">
              <NumberInput
                step="0.01"
                min="0"
                value={form.gst}
                onChange={(gst) =>
                  setForm((prev) => {
                    const nextGst = round2(gst)
                    return { ...prev, gst: nextGst, total: round2(prev.amount + nextGst + prev.qst) }
                  })
                }
              />
            </Field>
            <Field label="TVQ (RTI)">
              <NumberInput
                step="0.01"
                min="0"
                value={form.qst}
                onChange={(qst) =>
                  setForm((prev) => {
                    const nextQst = round2(qst)
                    return { ...prev, qst: nextQst, total: round2(prev.amount + prev.gst + nextQst) }
                  })
                }
              />
            </Field>
          </div>
          {form.applyTax && (
            <p className="text-xs text-muted-foreground">
              {settings
                ? `TPS ${Math.round(Number(settings.gst_rate) * 10000) / 100}% · TVQ ${Math.round(Number(settings.qst_rate) * 10000) / 100}% sur HT (chacune)`
                : 'TPS 5 % · TVQ 9,975 % sur HT (chacune)'}
              {' · '}
              Arrondi au cent (chaque taxe). Saisir le TTC ou le HT recalcule le reste.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.taxable}
              onChange={(e) => setForm({ ...form, taxable: e.target.checked })}
            />
            Remboursement imposable (HT ajouté au brut de paie ; TTC toujours versé à l&apos;employé)
          </label>
          {!form.taxable && (
            <p className="text-xs text-muted-foreground">
              Par défaut, le remboursement est non imposable : le TTC s&apos;ajoute au net de paie, sans retenues.
            </p>
          )}
          {form.taxable && (
            <p className="text-xs text-muted-foreground">
              L&apos;employé reçoit le TTC. Seul le montant HT est assujetti aux cotisations et à l&apos;impôt ; TPS/TVQ
              sont ajoutées au net.
            </p>
          )}
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {editingId && (
            <DocumentAttachments
              entityType="employee_expense"
              entityId={editingId}
              disabled={!!rows.find((r) => r.id === editingId)?.payroll_run_id}
              label="Pièces déjà enregistrées"
              hint={receiptFile ? 'Un nouveau reçu ci-dessus sera ajouté à l’enregistrement.' : undefined}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </PageShell>
  )
}
