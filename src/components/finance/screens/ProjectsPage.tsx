'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { usePathname } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import { deleteEntityDocuments } from '@/lib/finance/documents'
import type { BillingType, Partner, Project, ProjectStatus } from '@/lib/finance/types'
import { matchesSearch } from '@/lib/finance/filters'
import { customerPartners } from '@/lib/finance/partners'
import { projectAmountLabel } from '@/lib/finance/invoice'
import { Badge } from '@/components/finance/Badge'
import {
  DeleteIconButton,
  EditIconButton,
  iconActionRevealClassName,
} from '@/components/layout/icon-action-button'
import { DocumentAttachments } from '@/components/finance/DocumentAttachments'
import { Modal } from '@/components/finance/Modal'
import { EmptyState } from '@/components/finance/EmptyState'
import { StepActionBar } from '@/components/finance/WorkflowNav'
import { WorkflowFooter } from '@/components/finance/WorkflowFooter'
import { db } from '@/lib/finance/db'
import {
  ListTableCard,
  listFooterClassName,
  listMobileEmptyClassName,
  listMobileFiltersClassName,
  listMobileFiltersStackClassName,
  listMobileItemClassName,
  listPageClassName,
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
  listTableCardViewportClassName,
  listTableEdgeEndClassName,
  listTableEdgeStartClassName,
  listTableEmptyCellClassName,
  listTableHeadClassName,
  listTableScrollClassName,
  listTableStickyHeaderClassName,
  listViewportStackClassName,
} from '@/components/layout/list-layout'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

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
    const partner = billablePartners.find((p) => p.id === form.partner_id)
    if (!partner) return
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

  const newBtn = (
    <Button size="sm" onClick={openNew} disabled={billablePartners.length === 0}>
      {t('projects.new')}
    </Button>
  )

  const list = (
    <div className={listViewportStackClassName}>
      <div className={listMobileFiltersStackClassName}>
        <div className={listMobileFiltersClassName}>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('projects.searchName')}
            aria-label={t('projects.filterProject')}
          />
          <NativeSelect
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            aria-label={t('projects.filterPartner')}
          >
            <option value="">{t('common.all')}</option>
            {billablePartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.legal_name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('projects.filterStatus')}
          >
            <option value="">{t('common.all')}</option>
            <option value="active">{t('projects.active')}</option>
            <option value="on_hold">{t('projects.onHold')}</option>
            <option value="completed">{t('projects.completed')}</option>
            <option value="archived">{t('projects.archived')}</option>
          </NativeSelect>
        </div>
        {filtered.length === 0 ? (
          <p className={listMobileEmptyClassName}>{t('projects.noneMatch')}</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((p) => (
              <li key={p.id} className={listMobileItemClassName}>
                <p className="font-medium text-brand">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.partners?.legal_name ?? t('common.dash')} · {billingLabel(t, p.billing_type)}
                </p>
                <p className="text-sm text-brand/80">{projectAmountLabel(p)}</p>
                <div className="mt-2 flex justify-end gap-0.5">
                  <EditIconButton label={t('common.edit')} onClick={() => openEdit(p)} />
                  <DeleteIconButton label={t('common.delete')} onClick={() => remove(p.id)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ListTableCard className={cn('hidden md:block', listTableCardViewportClassName)}>
        <div className={listTableScrollClassName}>
          <Table>
            <TableHeader className={listTableStickyHeaderClassName}>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn('min-w-[12rem]', listTableHeadClassName, listTableEdgeStartClassName)}>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium">{t('projects.project')}</span>
                    <Input
                      type="search"
                      density="dense"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('projects.searchName')}
                      aria-label={t('projects.filterProject')}
                    />
                  </div>
                </TableHead>
                <TableHead className={cn('min-w-[10rem]', listTableHeadClassName)}>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium">{t('projects.partner')}</span>
                    <NativeSelect
                      density="dense"
                      value={partnerFilter}
                      onChange={(e) => setPartnerFilter(e.target.value)}
                      aria-label={t('projects.filterPartner')}
                    >
                      <option value="">{t('common.all')}</option>
                      {billablePartners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.legal_name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </TableHead>
                <TableHead className={cn(listTableHeadClassName)}>{t('projects.billing')}</TableHead>
                <TableHead className={cn(listTableHeadClassName)}>{t('projects.amount')}</TableHead>
                <TableHead className={cn('min-w-[8rem]', listTableHeadClassName)}>
                  <div className="flex flex-col gap-1.5">
                    <span className="font-medium">{t('projects.status')}</span>
                    <NativeSelect
                      density="dense"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label={t('projects.filterStatus')}
                    >
                      <option value="">{t('common.all')}</option>
                      <option value="active">{t('projects.active')}</option>
                      <option value="on_hold">{t('projects.onHold')}</option>
                      <option value="completed">{t('projects.completed')}</option>
                      <option value="archived">{t('projects.archived')}</option>
                    </NativeSelect>
                  </div>
                </TableHead>
                <TableHead className={cn('w-12', listTableHeadClassName, listTableEdgeEndClassName)}>
                  <span className="sr-only">{t('common.edit')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className={listTableEmptyCellClassName}>
                    {t('projects.noneMatch')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell className={cn('whitespace-normal', listTableEdgeStartClassName)}>
                      <span className="font-medium text-brand">{p.name}</span>
                      {p.po_number?.trim() ? (
                        <div className="text-xs text-muted-foreground">
                          {t('common.poPrefix', { po: p.po_number.trim() })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.partners?.legal_name ?? t('common.dash')}
                    </TableCell>
                    <TableCell>
                      <Badge
                        label={billingLabel(t, p.billing_type)}
                        tone={p.billing_type === 'fixed' ? 'sent' : 'active'}
                      />
                    </TableCell>
                    <TableCell>{projectAmountLabel(p)}</TableCell>
                    <TableCell>
                      <Badge label={statusLabel(t, p.status)} tone={p.status} />
                    </TableCell>
                    <TableCell className={cn('text-right', listTableEdgeEndClassName)}>
                      <div className="flex items-center justify-end gap-0.5">
                        <EditIconButton
                          className={iconActionRevealClassName}
                          label={t('common.edit')}
                          onClick={() => openEdit(p)}
                        />
                        <DeleteIconButton
                          className={iconActionRevealClassName}
                          label={t('common.delete')}
                          onClick={() => remove(p.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ListTableCard>

      <div className={listFooterClassName}>
        <p className="text-sm text-muted-foreground">
          {t('projects.showingCount', { shown: filtered.length, total: rows.length })}
        </p>
        {hasFilters ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch('')
              setPartnerFilter('')
              setStatusFilter('')
            }}
          >
            {t('projects.clearFilters')}
          </Button>
        ) : null}
      </div>
    </div>
  )

  const formModal = (
    <Modal title={editingId ? t('projects.edit') : t('projects.new')} open={open} onClose={() => setOpen(false)}>
      <FormStack onSubmit={save}>
        <Field>
          <FieldLabel htmlFor="engagement-partner" required>
            {t('projects.partner')}
          </FieldLabel>
          <NativeSelect
            id="engagement-partner"
            required
            value={form.partner_id}
            onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
          >
            {billablePartners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.legal_name}
              </option>
            ))}
          </NativeSelect>
          <FieldHint>{t('projects.needClient')}</FieldHint>
        </Field>
        <Field>
          <FieldLabel htmlFor="engagement-name" required>
            {t('projects.project')}
          </FieldLabel>
          <Input
            id="engagement-name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="engagement-billing" required>
            {t('projects.billingType')}
          </FieldLabel>
          <NativeSelect
            id="engagement-billing"
            value={form.billing_type}
            onChange={(e) => setForm({ ...form, billing_type: e.target.value as BillingType })}
          >
            <option value="hourly">{t('common.hourlyTimeLogged')}</option>
            <option value="fixed">{t('common.fixedAmount')}</option>
          </NativeSelect>
        </Field>
        <FieldGrid columns={2}>
          {form.billing_type === 'hourly' ? (
            <Field>
              <FieldLabel htmlFor="engagement-rate" required>
                {t('projects.hourlyRate')}
              </FieldLabel>
              <Input
                id="engagement-rate"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.default_hourly_rate}
                onChange={(e) => setForm({ ...form, default_hourly_rate: Number(e.target.value) })}
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="engagement-fixed" required>
                {t('projects.fixedAmount')}
              </FieldLabel>
              <Input
                id="engagement-fixed"
                type="number"
                step="0.01"
                min="0"
                required
                value={form.fixed_price}
                onChange={(e) => setForm({ ...form, fixed_price: Number(e.target.value) })}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="engagement-status">{t('projects.status')}</FieldLabel>
            <NativeSelect
              id="engagement-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
            >
              <option value="active">{t('projects.active')}</option>
              <option value="on_hold">{t('projects.onHold')}</option>
              <option value="completed">{t('projects.completed')}</option>
              <option value="archived">{t('projects.archived')}</option>
            </NativeSelect>
          </Field>
        </FieldGrid>
        {form.billing_type === 'fixed' ? (
          <FieldHint>{t('projects.fixedHint')}</FieldHint>
        ) : null}
        <Field>
          <FieldLabel htmlFor="engagement-po">{t('projects.poNumber')}</FieldLabel>
          <Input
            id="engagement-po"
            value={form.po_number}
            onChange={(e) => setForm({ ...form, po_number: e.target.value })}
            placeholder={t('projects.poHint')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="engagement-notes">{t('projects.notes')}</FieldLabel>
          <Textarea
            id="engagement-notes"
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
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit">{t('common.save')}</Button>
        </div>
      </FormStack>
    </Modal>
  )

  const body = (
    <>
      {billablePartners.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('projects.needClient')}</p>
      ) : null}
      {rows.length === 0 ? <EmptyState message={t('projects.empty')} /> : list}
      {formModal}
      {embedded && rows.some((p) => p.status === 'active') ? (
        <WorkflowFooter to="/billing/pipeline" label={t('projects.planPipeline')}>
          {t('projects.confirmActive')}
        </WorkflowFooter>
      ) : null}
    </>
  )

  if (embedded) {
    return (
      <div className="space-y-3">
        {rows.length === 0 ? <StepActionBar actions={newBtn} /> : null}
        {body}
      </div>
    )
  }

  return (
    <div className={listPageClassName}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
        <div className={listPageHeaderClassName}>
          <h1 className={listPageTitleClassName}>{t('projects.title')}</h1>
          <p className={listPageSubtitleClassName}>{t('projects.subtitle')}</p>
        </div>
        {newBtn}
      </div>
      {body}
    </div>
  )
}

function billingLabel(
  t: ReturnType<typeof useTranslations<'financeApp'>>,
  type: BillingType,
) {
  return type === 'fixed' ? t('pipeline.fixed') : t('pipeline.hourly')
}

function statusLabel(
  t: ReturnType<typeof useTranslations<'financeApp'>>,
  status: ProjectStatus,
) {
  if (status === 'on_hold') return t('projects.onHold')
  if (status === 'completed') return t('projects.completed')
  if (status === 'archived') return t('projects.archived')
  return t('projects.active')
}
