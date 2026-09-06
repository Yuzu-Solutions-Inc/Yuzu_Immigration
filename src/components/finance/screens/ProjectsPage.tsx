'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import { deleteEntityDocuments } from '@/lib/finance/documents'
import type { BillingType, Partner, Project, ProjectStatus } from '@/lib/finance/types'
import { matchesSearch } from '@/lib/finance/filters'
import { customerPartners } from '@/lib/finance/partners'
import { billingTypeLabel, projectAmountLabel } from '@/lib/finance/invoice'
import { Badge } from '@/components/finance/Badge'
import { Button, tableActionClass } from '@/components/finance/Button'
import { DataTable } from '@/components/finance/DataTable'
import { DocumentAttachments } from '@/components/finance/DocumentAttachments'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import { FilterSummary, FilterTh, HeaderSearch, HeaderSelect, PlainTh } from '@/components/finance/ColumnFilters'
import { PageHeader } from '@/components/finance/PageHeader'
import { StepActionBar } from '@/components/finance/WorkflowNav'
import { WorkflowFooter } from '@/components/finance/WorkflowFooter'
import { PageShell } from '@/components/finance/PageShell'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

type BillingOutletContext = { refreshMetrics?: () => void }

export function ProjectsPage() {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const embedded = pathname.startsWith('/billing')
  const { refreshMetrics } = useFinanceOutlet<BillingOutletContext>() ?? {}
  const [rows, setRows] = useState<Project[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    partner_id: '',
    name: '',
    status: 'active' as ProjectStatus,
    billing_type: 'hourly' as BillingType,
    default_hourly_rate: 150,
    fixed_price: 3500,
    po_number: '',
    notes: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const billablePartners = useMemo(() => customerPartners(partners), [partners])

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (partnerFilter && p.partner_id !== partnerFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      return matchesSearch(
        search,
        p.name,
        p.partners?.legal_name,
        p.po_number,
        p.notes,
        p.default_hourly_rate,
        p.fixed_price,
        p.billing_type
      )
    })
  }, [rows, search, partnerFilter, statusFilter])

  const hasFilters = !!(search || partnerFilter || statusFilter)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [p, c] = await Promise.all([
      db.from('projects').select('*, partners(legal_name, kind)').order('name'),
      db.from('partners').select('*').order('legal_name'),
    ])
    setRows((p.data as Project[]) ?? [])
    setPartners(c.data ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    setForm({
      partner_id: billablePartners[0]?.id ?? '',
      name: '',
      status: 'active',
      billing_type: 'hourly',
      default_hourly_rate: 150,
      fixed_price: 3500,
      po_number: '',
      notes: '',
    })
    setEditingId(null)
    setOpen(true)
  }

  function openEdit(p: Project) {
    setForm({
      partner_id: p.partner_id,
      name: p.name,
      status: p.status,
      billing_type: p.billing_type === 'fixed' ? 'fixed' : 'hourly',
      default_hourly_rate: p.default_hourly_rate,
      fixed_price: p.fixed_price != null ? Number(p.fixed_price) : 3500,
      po_number: p.po_number ?? '',
      notes: p.notes ?? '',
    })
    setEditingId(p.id)
    setOpen(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      partner_id: form.partner_id,
      name: form.name,
      status: form.status,
      billing_type: form.billing_type,
      default_hourly_rate: form.billing_type === 'hourly' ? form.default_hourly_rate : 0,
      fixed_price: form.billing_type === 'fixed' ? form.fixed_price : null,
      currency: 'CAD' as const,
      po_number: form.po_number.trim() || null,
      notes: form.notes || null,
    }
    if (editingId) {
      await db.from('projects').update(payload).eq('id', editingId)
      setOpen(false)
    } else {
      const { data, error } = await db.from('projects').insert(payload).select('id').single()
      if (!error && data?.id) {
        setEditingId(data.id)
        // Keep modal open so a PDF contract can be attached immediately.
      } else {
        setOpen(false)
      }
    }
    load()
  }

  async function remove(id: string) {
    if (!confirm(t('projects.confirmDelete'))) return
    try {
      await deleteEntityDocuments('project', id)
    } catch {
      // continue — project row must still be removable if storage cleanup fails
    }
    await db.from('projects').delete().eq('id', id)
    load()
  }

  const newProjectBtn = (
    <Button onClick={openNew} disabled={billablePartners.length === 0}>
      {t('projects.new')}
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setPartnerFilter('')
    setStatusFilter('')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={newProjectBtn} />
      ) : (
        <PageHeader title={t('projects.title')} actions={newProjectBtn} />
      )}
      {billablePartners.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3">
          {t('projects.needClient')}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState message={t('projects.empty')} />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? newProjectBtn : undefined}
          />
          <DataTable minWidth={900}>
            <thead className="bg-muted text-left">
              <tr>
                <FilterTh label={t('projects.project')}>
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder={t('projects.searchName')}
                    aria-label={t('projects.filterProject')}
                  />
                </FilterTh>
                <FilterTh label={t('projects.partner')}>
                  <HeaderSelect
                    value={partnerFilter}
                    onChange={setPartnerFilter}
                    aria-label={t('projects.filterPartner')}
                    options={[
                      { value: '', label: t('common.all') },
                      ...billablePartners.map((p) => ({ value: p.id, label: p.legal_name })),
                    ]}
                  />
                </FilterTh>
                <PlainTh>{t('projects.billing')}</PlainTh>
                <PlainTh>{t('projects.amount')}</PlainTh>
                <FilterTh label={t('projects.status')}>
                  <HeaderSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    aria-label={t('projects.filterStatus')}
                    options={[
                      { value: '', label: t('common.all') },
                      { value: 'active', label: t('projects.active') },
                      { value: 'on_hold', label: t('projects.onHold') },
                      { value: 'completed', label: t('projects.completed') },
                      { value: 'archived', label: t('projects.archived') },
                    ]}
                  />
                </FilterTh>
                <PlainTh className="w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {t('projects.noneMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/50">
                    <td className="px-3 py-3 font-medium">
                      {p.name}
                      {p.po_number?.trim() && (
                        <div className="text-xs font-normal text-muted-foreground mt-0.5">{t('common.poPrefix', { po: p.po_number.trim() })}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{p.partners?.legal_name ?? t('common.dash')}</td>
                    <td className="px-3 py-3">
                      <Badge label={billingTypeLabel(p.billing_type)} tone={p.billing_type === 'fixed' ? 'sent' : 'active'} />
                    </td>
                    <td className="px-3 py-3">{projectAmountLabel(p)}</td>
                    <td className="px-3 py-3">
                      <Badge label={p.status} tone={p.status} />
                      {p.billing_type === 'fixed' && p.invoice_id && (
                        <span className="ml-2 text-xs text-muted-foreground">{t('projects.invoiced')}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right space-x-2">
                      <Button variant="ghost" className={tableActionClass} onClick={() => openEdit(p)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => remove(p.id)}>
                        {t('common.deleteShort')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}
      <Modal title={editingId ? t('projects.edit') : t('projects.new')} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3">
          <Field label={t('projects.partnerClient')}>
            <select
              className={inputClass}
              required
              value={form.partner_id}
              onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
            >
              {billablePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.legal_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('projects.projectName')}>
            <input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t('projects.billingType')}>
            <select
              className={inputClass}
              value={form.billing_type}
              onChange={(e) => setForm({ ...form, billing_type: e.target.value as BillingType })}
            >
              <option value="hourly">{t('common.hourlyTimeLogged')}</option>
              <option value="fixed">{t('common.fixedAmount')}</option>
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {form.billing_type === 'hourly' ? (
              <Field label={t('projects.hourlyRate')}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  required
                  value={form.default_hourly_rate}
                  onChange={(e) => setForm({ ...form, default_hourly_rate: Number(e.target.value) })}
                />
              </Field>
            ) : (
              <Field label={t('projects.fixedAmount')}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                  required
                  value={form.fixed_price}
                  onChange={(e) => setForm({ ...form, fixed_price: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label={t('projects.status')}>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
              >
                <option value="active">active</option>
                <option value="on_hold">on_hold</option>
                <option value="completed">completed</option>
                <option value="archived">archived</option>
              </select>
            </Field>
          </div>
          {form.billing_type === 'fixed' && (
            <p className="text-xs text-muted-foreground">
              {t('projects.fixedHint')}
            </p>
          )}
          <Field label={t('projects.poNumber')}>
            <input
              className={inputClass}
              value={form.po_number}
              onChange={(e) => setForm({ ...form, po_number: e.target.value })}
              placeholder={t('projects.poHint')}
            />
          </Field>
          <Field label={t('projects.notes')}>
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <DocumentAttachments
            entityType="project"
            entityId={editingId}
            pdfOnly
            label={t('projects.contractPdf')}
            hint={t('projects.contractHint')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
      {embedded && rows.some((p) => p.status === 'active') && (
        <WorkflowFooter to="/billing/pipeline" label={t('projects.planPipeline')}>
          {t('projects.confirmActive')}
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
