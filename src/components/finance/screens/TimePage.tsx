'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import type { Employee, Project } from '@/lib/finance/types'
import { formatCad, formatDate, relationOne, todayIso } from '@/lib/finance/format'
import { inDateRange, matchesSearch } from '@/lib/finance/filters'
import { isFixedProject } from '@/lib/finance/billingMetrics'
import { employeeDisplayName } from '@/lib/finance/payrollCalc'
import {
  entryHasBillableLines,
  fetchItemNameSuggestions,
  normalizeItemName,
  resolveItemName,
  sheetBillableAmount,
  sheetSummary,
  totalLineHours,
  type TimeEntryLineDraft,
  type TimeEntryWithLines,
} from '@/lib/finance/timeEntries'
import { Badge } from '@/components/finance/Badge'
import { Button } from '@/components/finance/Button'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { EmptyState } from '@/components/finance/EmptyState'
import {
  DeleteIconButton,
  EditIconButton,
  iconActionRevealClassName,
} from '@/components/layout/icon-action-button'
import {
  Field,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'
import {
  FilterSummary,
  FilterTh,
  HeaderDateRange,
  HeaderSearch,
  HeaderSelect,
  PlainTh,
} from '@/components/finance/ColumnFilters'
import { PageHeader } from '@/components/finance/PageHeader'
import { StepActionBar } from '@/components/finance/WorkflowNav'
import { WorkflowFooter } from '@/components/finance/WorkflowFooter'
import { PageShell } from '@/components/finance/PageShell'
import { AlertBanner } from '@/components/finance/AlertBanner'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { db } from '@/lib/finance/db'
import { fetchTimeScreen, type TimeScreenData } from '@/lib/finance/screen-data'
import { useTranslations } from 'next-intl'

type Filter = 'all' | 'unbilled' | 'invoiced'
type BillingOutletContext = { refreshMetrics?: () => void }

const emptyLine = (): TimeEntryLineDraft => ({
  item_name: '',
  hours: 1,
  notes: '',
  billable: true,
})

function ItemNameInput({
  id,
  value,
  onChange,
  suggestions,
  listId,
  required,
  placeholder,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  listId: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <>
      <Input
        id={id}
        required={required}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}

export function TimePage({ initial }: { initial?: TimeScreenData }) {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const embedded = pathname.startsWith('/engagements') || pathname.startsWith('/billing')
  const { refreshMetrics } = useFinanceOutlet<BillingOutletContext>() ?? {}
  const [rows, setRows] = useState<TimeEntryWithLines[]>(initial?.entries ?? [])
  const [employees, setEmployees] = useState<Employee[]>(initial?.employees ?? [])
  const [allProjects, setAllProjects] = useState<Project[]>(initial?.allProjects ?? [])
  const [projects, setProjects] = useState<Project[]>(
    () => (initial?.allProjects ?? []).filter((x) => x.status === 'active'),
  )
  const [billingFilter, setBillingFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [open, setOpen] = useState(false)
  const { blockIfClosed } = usePeriodCloseGuard()
  const [form, setForm] = useState({
    project_id: '',
    employee_id: '',
    entry_date: todayIso(),
    notes: '',
    rate_override: '',
    lines: [emptyLine()] as TimeEntryLineDraft[],
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [itemSuggestions, setItemSuggestions] = useState<string[]>([])

  const partnerOptions = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of allProjects) {
      if (p.partners?.legal_name) names.set(p.partner_id, p.partners.legal_name)
    }
    return [...names.entries()].map(([id, label]) => ({ value: id, label }))
  }, [allProjects])

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      const proj = relationOne(t.projects)
      const lines = t.time_entry_lines ?? []
      const summary = sheetSummary(lines)
      const lineText = lines.map((l) => `${l.item_name} ${l.notes ?? ''}`).join(' ')
      if (billingFilter === 'unbilled' && t.invoice_id) return false
      if (billingFilter === 'invoiced' && !t.invoice_id) return false
      if (projectFilter && t.project_id !== projectFilter) return false
      if (partnerFilter && proj?.partner_id !== partnerFilter) return false
      if (!inDateRange(t.entry_date, dateFrom, dateTo)) return false
      const inv = relationOne(t.invoices)
      const emp = relationOne(t.employees)
      return matchesSearch(
        search,
        summary,
        lineText,
        t.notes,
        proj?.name,
        proj?.partners?.legal_name,
        inv?.invoice_number,
        emp ? employeeDisplayName(emp) : ''
      )
    })
  }, [rows, billingFilter, projectFilter, partnerFilter, dateFrom, dateTo, search])

  const hasFilters = !!(search || projectFilter || partnerFilter || dateFrom || dateTo || billingFilter !== 'all')

  useEffect(() => {
    if (initial) return
    void load()
  }, [])

  async function load() {
    const data = await fetchTimeScreen(db)
    setAllProjects(data.allProjects)
    setProjects(data.allProjects.filter((x) => x.status === 'active'))
    setRows(data.entries)
    setEmployees(data.employees)
    refreshMetrics?.()
  }

  const defaultEmployeeId = employees[0]?.id ?? ''

  function refreshItemSuggestions(projectId: string) {
    if (!projectId) {
      setItemSuggestions([])
      return
    }
    void fetchItemNameSuggestions(projectId).then(setItemSuggestions)
  }

  function openNew() {
    const projectId = projects[0]?.id ?? ''
    setForm({
      project_id: projectId,
      employee_id: defaultEmployeeId,
      entry_date: todayIso(),
      notes: '',
      rate_override: '',
      lines: [emptyLine()],
    })
    setEditingId(null)
    setOpen(true)
    refreshItemSuggestions(projectId)
  }

  function openEdit(sheet: TimeEntryWithLines) {
    if (sheet.invoice_id) {
      alert(t('time.alreadyInvoiced'))
      return
    }
    setForm({
      project_id: sheet.project_id,
      employee_id: sheet.employee_id ?? defaultEmployeeId,
      entry_date: sheet.entry_date,
      notes: sheet.notes ?? '',
      rate_override: sheet.rate_override != null ? String(sheet.rate_override) : '',
      lines:
        (sheet.time_entry_lines ?? []).length > 0
          ? (sheet.time_entry_lines ?? []).map((l) => ({
              id: l.id,
              item_name: l.item_name,
              hours: Number(l.hours),
              notes: l.notes ?? '',
              billable: l.billable,
            }))
          : [emptyLine()],
    })
    setEditingId(sheet.id)
    setOpen(true)
    refreshItemSuggestions(sheet.project_id)
  }

  const collidingSheet = useMemo(() => {
    if (!open || !form.project_id || !form.entry_date) return undefined
    const employeeKey = form.employee_id || ''
    return rows.find(
      (r) =>
        r.id !== editingId &&
        r.project_id === form.project_id &&
        r.entry_date === form.entry_date &&
        (r.employee_id ?? '') === employeeKey
    )
  }, [open, rows, editingId, form.project_id, form.entry_date, form.employee_id])

  function updateLine(index: number, patch: Partial<TimeEntryLineDraft>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
  }

  function addLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }))
  }

  function removeLine(index: number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? [emptyLine()] : prev.lines.filter((_, i) => i !== index),
    }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const prior = editingId ? rows.find((r) => r.id === editingId) : undefined
    if (blockIfClosed(prior?.entry_date, form.entry_date)) return

    const project = projects.find((p) => p.id === form.project_id)
    const internalFixed = project ? isFixedProject(project) : false
    const cleanedLines = form.lines
      .map((line) => ({
        ...line,
        item_name: resolveItemName(line.item_name, itemSuggestions),
        notes: line.notes.trim(),
        billable: internalFixed ? false : line.billable,
      }))
      .filter((line) => normalizeItemName(line.item_name) && Number(line.hours) > 0)

    if (cleanedLines.length === 0) {
      alert(t('time.needLine'))
      return
    }

    if (collidingSheet) {
      alert(t('time.duplicate'))
      return
    }

    const totalHours = totalLineHours(cleanedLines)
    const headerPayload = {
      project_id: form.project_id,
      employee_id: form.employee_id || null,
      entry_date: form.entry_date,
      hours: totalHours,
      description: null,
      notes: form.notes.trim() || null,
      billable: entryHasBillableLines(cleanedLines),
      rate_override: form.rate_override ? Number(form.rate_override) : null,
    }

    let entryId = editingId
    if (entryId) {
      const { error } = await db.from('time_entries').update(headerPayload).eq('id', entryId)
      if (error) {
        alert(error.code === '23505' ? t('time.duplicate') : error.message)
        return
      }
      await db.from('time_entry_lines').delete().eq('time_entry_id', entryId)
    } else {
      const { data, error } = await db.from('time_entries').insert(headerPayload).select('id').single()
      if (error || !data) {
        alert(error?.code === '23505' ? t('time.duplicate') : (error?.message ?? t('time.duplicate')))
        return
      }
      entryId = data.id
    }

    const linePayload = cleanedLines.map((line, sort_order) => ({
      time_entry_id: entryId!,
      item_name: line.item_name,
      hours: line.hours,
      notes: line.notes || null,
      billable: line.billable,
      sort_order,
    }))
    const { error: lineErr } = await db.from('time_entry_lines').insert(linePayload)
    if (lineErr) {
      alert(lineErr.message)
      return
    }

    setOpen(false)
    load()
  }

  async function remove(entry: TimeEntryWithLines) {
    if (entry.invoice_id) {
      alert(t('time.cannotDeleteInvoiced'))
      return
    }
    if (!confirm(t('time.confirmDelete'))) return
    if (blockIfClosed(entry.entry_date)) return
    await db.from('time_entries').delete().eq('id', entry.id)
    load()
  }

  const unbilledCount = useMemo(
    () => rows.filter((t) => !t.invoice_id && entryHasBillableLines(t.time_entry_lines ?? [])).length,
    [rows]
  )

  const selectedProject = projects.find((p) => p.id === form.project_id)
  const fixedInternal = selectedProject ? isFixedProject(selectedProject) : false
  const formTotalHours = totalLineHours(form.lines)
  const datalistId = 'time-item-suggestions'

  const logTimeBtn = (
    <Button onClick={openNew} disabled={projects.length === 0 || employees.length === 0}>
      {t('time.log')}
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setProjectFilter('')
    setPartnerFilter('')
    setDateFrom('')
    setDateTo('')
    setBillingFilter('all')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={logTimeBtn} />
      ) : (
        <PageHeader
          title={t('time.title')}
          subtitle={t('time.subtitle')}
          actions={logTimeBtn}
        />
      )}
      {employees.length === 0 && (
        <AlertBanner>
          <Link href="/compensation/employees" className="font-medium underline">
            {t('time.addEmployee')}
          </Link>{' '}
          {t('time.addEmployeeBefore')}
        </AlertBanner>
      )}
      {rows.length === 0 ? (
        <EmptyState message={t('time.empty')} />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? logTimeBtn : undefined}
          />
          <DataTable>
            <thead className="bg-muted text-left">
              <tr>
                <FilterTh label={t('time.date')}>
                  <HeaderDateRange
                    from={dateFrom}
                    to={dateTo}
                    onFromChange={setDateFrom}
                    onToChange={setDateTo}
                  />
                </FilterTh>
                <FilterTh label={t('time.project')}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <HeaderSelect
                      value={projectFilter}
                      onChange={setProjectFilter}
                      aria-label={t('time.filterProject')}
                      options={[
                        { value: '', label: t('time.allProjects') },
                        ...allProjects.map((p) => ({ value: p.id, label: p.name })),
                      ]}
                    />
                    <HeaderSelect
                      value={partnerFilter}
                      onChange={setPartnerFilter}
                      aria-label={t('time.filterPartner')}
                      options={[{ value: '', label: t('time.allPartners') }, ...partnerOptions]}
                    />
                  </div>
                </FilterTh>
                <FilterTh label={t('time.items')}>
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder={t('time.itemsPlaceholder')}
                    aria-label={t('time.filterItem')}
                  />
                </FilterTh>
                <PlainTh>{t('time.hours')}</PlainTh>
                <PlainTh>{t('time.amount')}</PlainTh>
                <FilterTh label={t('time.billing')}>
                  <HeaderSelect
                    value={billingFilter}
                    onChange={(v) => setBillingFilter(v as Filter)}
                    aria-label={t('time.filterBilling')}
                    options={[
                      { value: 'all', label: t('time.allBilling') },
                      { value: 'unbilled', label: t('time.unbilled') },
                      { value: 'invoiced', label: t('time.invoiced') },
                    ]}
                  />
                </FilterTh>
                <PlainTh className="w-px">
                  <span className="sr-only">{t('common.edit')}</span>
                </PlainTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {t('time.noneMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((sheet) => {
                  const proj = relationOne(sheet.projects)
                  const internal = proj ? isFixedProject(proj as Project) : false
                  const lines = sheet.time_entry_lines ?? []
                  const hours = lines.length > 0 ? totalLineHours(lines) : Number(sheet.hours)
                  const amt = internal ? 0 : sheetBillableAmount(sheet, proj ?? undefined)
                  const inv = relationOne(sheet.invoices)
                  return (
                    <tr key={sheet.id} className="group hover:bg-muted/50">
                      <td className="px-3 py-3">{formatDate(sheet.entry_date)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{proj?.name ?? t('common.dash')}</div>
                        <div className="text-xs text-muted-foreground">{proj?.partners?.legal_name}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground max-w-md truncate">{sheetSummary(lines)}</td>
                      <td className="px-3 py-3">{hours.toFixed(2)}</td>
                      <td className="px-3 py-3">{internal ? t('common.dash') : amt > 0 ? formatCad(amt) : t('common.dash')}</td>
                      <td className="px-3 py-3">
                        {internal ? (
                          <Badge label={t('time.internal')} tone="sent" />
                        ) : sheet.invoice_id ? (
                          <Badge label={inv?.invoice_number ?? t('time.invoicedBadge')} tone="invoiced" />
                        ) : (
                          <Badge label={t('time.unbilled')} tone="unbilled" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <EditIconButton
                            className={iconActionRevealClassName}
                            label={t('common.edit')}
                            onClick={() => openEdit(sheet)}
                          />
                          <DeleteIconButton
                            className={iconActionRevealClassName}
                            label={t('common.delete')}
                            onClick={() => remove(sheet)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </DataTable>
        </>
      )}

      <Modal
        title={editingId ? t('time.editSheet') : t('time.newSheet')}
        open={open}
        onClose={() => setOpen(false)}
        wide
      >
        <FormStack onSubmit={save}>
          <FieldGrid columns={3}>
            <Field>
              <FieldLabel htmlFor="timesheet-employee" required>
                {t('common.employee')}
              </FieldLabel>
              <NativeSelect
                id="timesheet-employee"
                required
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {employeeDisplayName(e)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="timesheet-project" required>
                {t('common.project')}
              </FieldLabel>
              <NativeSelect
                id="timesheet-project"
                required
                value={form.project_id}
                onChange={(e) => {
                  const projectId = e.target.value
                  setForm({ ...form, project_id: projectId })
                  refreshItemSuggestions(projectId)
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.billing_type === 'fixed' ? t('pipeline.fixed') : t('pipeline.hourly')} ({p.partners?.legal_name})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="timesheet-date" required>
                {t('time.date')}
              </FieldLabel>
              <Input
                id="timesheet-date"
                type="date"
                required
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              />
            </Field>
          </FieldGrid>

          {fixedInternal ? <FieldHint>{t('time.fixedInternalHint')}</FieldHint> : null}

          {collidingSheet ? (
            <AlertBanner>
              {t('time.duplicate')}{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => openEdit(collidingSheet)}
              >
                {t('time.openExisting')}
              </button>
            </AlertBanner>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('time.itemsOfDay')}
              </p>
              <span className="text-xs text-muted-foreground">
                {t('time.totalHours', { hours: formTotalHours.toFixed(2) })}
              </span>
            </div>
            <div className="divide-y divide-border">
              {form.lines.map((line, index) => (
                <div key={index} className="space-y-3 p-4">
                  <div className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-12">
                    <Field className="sm:col-span-5">
                      <FieldLabel htmlFor={`timesheet-item-${index}`} required>
                        {t('time.item')}
                      </FieldLabel>
                      <ItemNameInput
                        id={`timesheet-item-${index}`}
                        value={line.item_name}
                        onChange={(value) => updateLine(index, { item_name: value })}
                        suggestions={itemSuggestions}
                        listId={`${datalistId}-${index}`}
                        required
                        placeholder={t('time.itemPlaceholder')}
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor={`timesheet-hours-${index}`} required>
                        {t('time.hours')}
                      </FieldLabel>
                      <Input
                        id={`timesheet-hours-${index}`}
                        type="number"
                        step="0.25"
                        min="0.25"
                        required
                        value={line.hours}
                        onChange={(e) => updateLine(index, { hours: Number(e.target.value) })}
                      />
                    </Field>
                    {!fixedInternal ? (
                      <Field className="sm:col-span-2">
                        <FieldLabel htmlFor={`timesheet-billable-${index}`}>
                          {t('time.billable')}
                        </FieldLabel>
                        <NativeSelect
                          id={`timesheet-billable-${index}`}
                          value={line.billable ? 'yes' : 'no'}
                          onChange={(e) => updateLine(index, { billable: e.target.value === 'yes' })}
                        >
                          <option value="yes">{t('common.yes')}</option>
                          <option value="no">{t('common.no')}</option>
                        </NativeSelect>
                      </Field>
                    ) : null}
                    <div className="flex justify-end pt-6 sm:col-span-3">
                      <DeleteIconButton
                        label={t('time.remove')}
                        onClick={() => removeLine(index)}
                      />
                    </div>
                  </div>
                  <Field>
                    <FieldLabel htmlFor={`timesheet-line-notes-${index}`}>
                      {t('time.dayNotes')}
                    </FieldLabel>
                    <Input
                      id={`timesheet-line-notes-${index}`}
                      value={line.notes}
                      onChange={(e) => updateLine(index, { notes: e.target.value })}
                      placeholder={t('time.dayNotesPlaceholder')}
                    />
                  </Field>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-4 py-3">
              <Button type="button" variant="secondary" onClick={addLine}>
                <Plus className="size-4" />
                {t('time.addItem')}
              </Button>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="timesheet-notes">{t('time.sheetNotes')}</FieldLabel>
            <Textarea
              id="timesheet-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t('time.sheetNotesPlaceholder')}
            />
          </Field>

          {!fixedInternal ? (
            <Field>
              <FieldLabel htmlFor="timesheet-rate">{t('time.rateOverride')}</FieldLabel>
              <Input
                id="timesheet-rate"
                type="number"
                step="0.01"
                placeholder={t('time.ratePlaceholder')}
                value={form.rate_override}
                onChange={(e) => setForm({ ...form, rate_override: e.target.value })}
              />
            </Field>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!!collidingSheet}>
              {t('common.save')}
            </Button>
          </div>
        </FormStack>
      </Modal>

      {embedded && unbilledCount > 0 && (
        <WorkflowFooter to="/engagements/invoices" label={t('time.createInvoice')}>
          {t('time.toBillCount', { count: unbilledCount })}
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
