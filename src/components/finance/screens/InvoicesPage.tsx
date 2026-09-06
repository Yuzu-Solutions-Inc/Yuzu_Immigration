'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import { supabase } from '@/lib/finance/supabase'
import type { Partner, Invoice, InvoiceLineItem, InvoiceStatus, OrganizationSettings, Project, TimeEntry } from '@/lib/finance/types'
import { customerPartners, INVOICE_LANGUAGE_LABELS, resolvePartnerPaymentTerms } from '@/lib/finance/partners'
import { partnerInvoiceLanguage } from '@/lib/finance/invoiceI18n'
import {
  buildGroupedLinesFromTimeSheets,
  sheetBillableAmount,
  sheetSummary,
  totalLineHours,
  type TimeEntryWithLines,
} from '@/lib/finance/timeEntries'
import {
  buildLegacyLinesFromTimeEntries,
  buildLineFromFixedProject,
  distinctPoNumbers,
  invoiceTaxDisplayRows,
  invoiceTotalsFromLines,
  salesTaxLinesForInvoice,
  type InvoiceLineDraft,
} from '@/lib/finance/invoice'
import { DEFAULT_CURRENCY, addDays, formatCad, formatDate, todayIso } from '@/lib/finance/format'
import { inDateRange, matchesSearch } from '@/lib/finance/filters'
import { defaultIncludeSalesTax, effectiveTaxSettings, hasSalesTaxNumbers } from '@/lib/finance/taxes'
import { deleteInvoice } from '@/lib/finance/invoiceActions'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { downloadInvoicePdf, saveInvoicePdfToStorage } from '@/lib/finance/invoicePdf'
import { Badge } from '@/components/finance/Badge'
import { Button } from '@/components/finance/Button'
import { DeleteIconButton, ViewIconButton, iconActionRevealClassName } from '@/components/layout/icon-action-button'
import { InvoiceStripeLinkButton } from '@/components/finance/invoice-stripe-link-button'
import { DataTable } from '@/components/finance/DataTable'
import { DocumentAttachments } from '@/components/finance/DocumentAttachments'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
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
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'
import { requireOrgId } from '@/lib/finance/workspaceStore'

type BillingOutletContext = { refreshMetrics?: () => void }

function LineItemsTable({ lines }: { lines: (InvoiceLineItem | InvoiceLineDraft)[] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-muted-foreground text-left border-b border-border">
          <tr>
            <th className="py-2 pr-2">Date</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">Qté</th>
            <th className="py-2 pr-2 text-right">Prix unit.</th>
            <th className="py-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={'id' in line ? line.id : i} className="border-b border-border">
              <td className="py-2 pr-2 text-muted-foreground">{line.line_date ? formatDate(line.line_date) : '—'}</td>
              <td className="py-2 pr-2">{line.description}</td>
              <td className="py-2 pr-2 text-right text-muted-foreground">
                {line.unit_label === 'h' ? `${Number(line.quantity).toFixed(2)} h` : '1'}
              </td>
              <td className="py-2 pr-2 text-right text-muted-foreground">
                {line.unit_label === 'h' ? `${formatCad(line.unit_price)}/h` : formatCad(line.unit_price)}
              </td>
              <td className="py-2 text-right font-medium">{formatCad(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InvoicesPage() {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const embedded = pathname.startsWith('/billing')
  const { refreshMetrics } = useFinanceOutlet<BillingOutletContext>() ?? {}
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<Invoice[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)
  const [docVersion, setDocVersion] = useState(0)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [invoicePoNumbers, setInvoicePoNumbers] = useState<string[]>([])
  const [createPartnerId, setCreatePartnerId] = useState('')
  const [unbilled, setUnbilled] = useState<TimeEntryWithLines[]>([])
  const [unbilledFixed, setUnbilledFixed] = useState<Project[]>([])
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [includeSalesTax, setIncludeSalesTax] = useState(false)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const billablePartners = useMemo(() => customerPartners(partners), [partners])

  const filtered = useMemo(() => {
    return rows.filter((inv) => {
      if (partnerFilter && inv.partner_id !== partnerFilter) return false
      if (statusFilter && inv.status !== statusFilter) return false
      if (!inDateRange(inv.invoice_date, dateFrom, dateTo)) return false
      return matchesSearch(search, inv.invoice_number, inv.partners?.legal_name, inv.status, inv.total)
    })
  }, [rows, search, partnerFilter, statusFilter, dateFrom, dateTo])

  const hasFilters = !!(search || partnerFilter || statusFilter || dateFrom || dateTo)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [inv, cli, set] = await Promise.all([
      db.from('invoices').select('*, partners(legal_name)').order('invoice_date', { ascending: false }),
      db.from('partners').select('*').order('legal_name'),
      db.from('organization_settings').select('*').maybeSingle(),
    ])
    setRows((inv.data as Invoice[]) ?? [])
    setPartners(cli.data ?? [])
    setSettings(set.data)
    const billable = customerPartners(cli.data ?? [])
    if (billable[0]) setCreatePartnerId(billable[0].id)
    refreshMetrics?.()
  }

  async function loadUnbilled(partnerId: string) {
    const [{ data: projects }, { data: timeData }] = await Promise.all([
      db.from('projects').select('*').eq('partner_id', partnerId),
      db
        .from('projects')
        .select('id')
        .eq('partner_id', partnerId)
        .eq('billing_type', 'hourly'),
    ])
    const hourlyIds = (timeData ?? []).map((p) => p.id)
    const fixed = ((projects as Project[]) ?? []).filter(
      (p) => p.billing_type === 'fixed' && !p.invoice_id && p.status !== 'archived'
    )
    setUnbilledFixed(fixed)
    setSelectedProjectIds(new Set(fixed.map((p) => p.id)))

    if (hourlyIds.length === 0) {
      setUnbilled([])
      setSelectedEntryIds(new Set())
      return
    }
    const { data } = await db
      .from('time_entries')
      .select('*, time_entry_lines(item_name, hours, billable, notes), projects(name, default_hourly_rate, billing_type)')
      .in('project_id', hourlyIds)
      .is('invoice_id', null)
      .eq('billable', true)
      .order('entry_date')
    const sheets = ((data as TimeEntryWithLines[]) ?? []).filter(
      (e) => (e.time_entry_lines ?? []).some((l) => l.billable && Number(l.hours) > 0) || Number(e.hours) > 0
    )
    setUnbilled(sheets)
    setSelectedEntryIds(new Set(sheets.map((e) => e.id)))
  }

  async function openCreate() {
    setIncludeSalesTax(defaultIncludeSalesTax(settings))
    setCreateOpen(true)
    if (createPartnerId) await loadUnbilled(createPartnerId)
  }

  async function loadPoNumbersForLines(lines: { project_id?: string | null }[]) {
    const projectIds = [...new Set(lines.map((l) => l.project_id).filter((id): id is string => !!id))]
    if (projectIds.length === 0) {
      setInvoicePoNumbers([])
      return
    }
    const { data } = await db.from('projects').select('po_number').in('id', projectIds)
    setInvoicePoNumbers(distinctPoNumbers((data as Pick<Project, 'po_number'>[]) ?? []))
  }

  async function viewDetail(inv: Invoice) {
    setSelected(inv)
    setInvoicePoNumbers([])
    const { data: lines } = await db
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('sort_order')
    if (lines && lines.length > 0) {
      setLineItems(lines as InvoiceLineItem[])
      await loadPoNumbersForLines(lines)
    } else if (!settings) {
      setLineItems([])
    } else {
      const { data: entries } = await db
        .from('time_entries')
        .select('*, time_entry_lines(item_name, hours, billable), projects(name, default_hourly_rate, billing_type)')
        .eq('invoice_id', inv.id)
        .order('entry_date')
      const withLines = entries ?? []
      const legacy =
        withLines.some((e) => (e.time_entry_lines ?? []).length > 0)
          ? buildGroupedLinesFromTimeSheets(withLines)
          : buildLegacyLinesFromTimeEntries(withLines as TimeEntry[])
      setLineItems(legacy as InvoiceLineItem[])
      await loadPoNumbersForLines(legacy)
    }
    setDetailOpen(true)
  }

  function taxSettingsForCreate() {
    if (!settings) return null
    return effectiveTaxSettings(settings, includeSalesTax)
  }

  function previewLines() {
    const selectedSheets = unbilled.filter((x) => selectedEntryIds.has(x.id))
    const hourlyLines = buildGroupedLinesFromTimeSheets(selectedSheets)
    const fixedLines = unbilledFixed
      .filter((x) => selectedProjectIds.has(x.id))
      .map((p, i) => buildLineFromFixedProject(p, hourlyLines.length + i))
    return [...hourlyLines, ...fixedLines]
  }

  function previewTotals() {
    const taxSettings = taxSettingsForCreate()
    if (!taxSettings) return { subtotal: 0, gst: 0, qst: 0, total: 0 }
    const partner = partners.find((p) => p.id === createPartnerId)
    return invoiceTotalsFromLines(previewLines(), taxSettings, partner?.province)
  }

  async function createInvoice() {
    if (!settings) return
    const lines = previewLines()
    if (lines.length === 0) return
    const partner = partners.find((p) => p.id === createPartnerId)
    if (!partner) return

    const { data: num, error: numErr } = await supabase.rpc('next_invoice_number', {
      p_organization_id: requireOrgId(),
    })
    if (numErr || !num) {
      alert(numErr?.message ?? 'Numéro de facture indisponible')
      return
    }

    const taxSettings = effectiveTaxSettings(settings, includeSalesTax)
    const totals = invoiceTotalsFromLines(lines, taxSettings, partner.province)
    const invoiceDate = todayIso()
    const entryDates = unbilled.filter((x) => selectedEntryIds.has(x.id)).map((x) => x.entry_date)
    if (blockIfClosed(invoiceDate, ...entryDates)) return
    const { days: paymentTermsDays } = resolvePartnerPaymentTerms(partner, settings)
    const dueDate = addDays(invoiceDate, paymentTermsDays)

    const { data: inv, error } = await db
      .from('invoices')
      .insert({
        partner_id: createPartnerId,
        invoice_number: num,
        invoice_date: invoiceDate,
        due_date: dueDate,
        currency: DEFAULT_CURRENCY,
        subtotal: totals.subtotal,
        gst: totals.gst,
        qst: totals.qst,
        total: totals.total,
        include_sales_tax: includeSalesTax,
        status: 'draft',
      })
      .select()
      .single()

    if (error || !inv) {
      alert(error?.message ?? 'Erreur')
      return
    }

    const { error: lineErr } = await db.from('invoice_line_items').insert(
      lines.map((line) => ({
        invoice_id: inv.id,
        project_id: line.project_id,
        time_entry_id: line.time_entry_id,
        line_date: line.line_date,
        description: line.description,
        quantity: line.quantity,
        unit_label: line.unit_label,
        unit_price: line.unit_price,
        subtotal: line.subtotal,
        sort_order: line.sort_order,
      }))
    )
    if (lineErr) {
      alert(lineErr.message)
      await db.from('invoices').delete().eq('id', inv.id)
      return
    }

    const taxLines = salesTaxLinesForInvoice(inv.id, totals)
    if (taxLines.length > 0) {
      const { error: taxLineErr } = await db.from('sales_tax_lines').insert(taxLines)
      if (taxLineErr) {
        console.warn('sales_tax_lines insert skipped', taxLineErr.message)
      }
    }

    const entryIds = [...selectedEntryIds]
    if (entryIds.length > 0) {
      await db.from('time_entries').update({ invoice_id: inv.id }).in('id', entryIds)
    }
    const projectIds = [...selectedProjectIds]
    if (projectIds.length > 0) {
      await db.from('projects').update({ invoice_id: inv.id }).in('id', projectIds)
    }

    setCreateOpen(false)
    load()
  }

  async function updateStatus(id: string, status: InvoiceStatus) {
    const inv = rows.find((r) => r.id === id) ?? selected
    if (inv && blockIfClosed(inv.invoice_date)) return
    await db.from('invoices').update({ status }).eq('id', id)
    load()
    if (selected?.id === id) setSelected({ ...selected, status })
  }

  async function handleDelete(inv: Invoice) {
    if (blockIfClosed(inv.invoice_date)) return
        if (!confirm(t('invoices.confirmDelete', { number: inv.invoice_number }))) return
    try {
      await deleteInvoice(inv.id, inv.invoice_date)
      setDetailOpen(false)
      setSelected(null)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function handlePdf() {
    if (!selected || !settings) return
    const partner = partners.find((p) => p.id === selected.partner_id)
    if (!partner) return
    try {
      await downloadInvoicePdf({
        invoice: selected,
        partner,
        settings,
        lines: lineItems,
        poNumbers: invoicePoNumbers,
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la génération du PDF')
    }
  }

  async function handleSavePdf() {
    if (!selected || !settings) return
    const partner = partners.find((p) => p.id === selected.partner_id)
    if (!partner) return
    setSavingPdf(true)
    try {
      await saveInvoicePdfToStorage({
        invoice: selected,
        partner,
        settings,
        lines: lineItems,
        poNumbers: invoicePoNumbers,
      })
      setDocVersion((v) => v + 1)
      alert('PDF enregistré dans Supabase.')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement du PDF')
    } finally {
      setSavingPdf(false)
    }
  }

  const preview = previewTotals()
  const canCreate = selectedEntryIds.size > 0 || selectedProjectIds.size > 0
  const nothingToBill = unbilled.length === 0 && unbilledFixed.length === 0
  const taxesEnabledInSettings = !!(
    settings?.charge_gst ||
    settings?.charge_qst ||
    hasSalesTaxNumbers(settings)
  )
  const showTaxesOnInvoice = includeSalesTax && taxesEnabledInSettings

  const createInvoiceBtn = (
    <Button onClick={openCreate} disabled={billablePartners.length === 0}>
      {t('invoices.create')}
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setPartnerFilter('')
    setStatusFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={createInvoiceBtn} />
      ) : (
        <PageHeader title={t('invoices.title')} actions={createInvoiceBtn} />
      )}
      {rows.length === 0 ? (
        <EmptyState message={t('invoices.empty')} />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? createInvoiceBtn : undefined}
          />
          <DataTable>
            <thead className="bg-muted text-left">
              <tr>
                <FilterTh label="N°">
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="N°, montant…"
                    aria-label="Filtrer par numéro"
                  />
                </FilterTh>
                <FilterTh label="Partenaire">
                  <HeaderSelect
                    value={partnerFilter}
                    onChange={setPartnerFilter}
                    aria-label="Filtrer par partenaire"
                    options={[
                      { value: '', label: 'Tous' },
                      ...billablePartners.map((p) => ({ value: p.id, label: p.legal_name })),
                    ]}
                  />
                </FilterTh>
                <FilterTh label="Date">
                  <HeaderDateRange
                    from={dateFrom}
                    to={dateTo}
                    onFromChange={setDateFrom}
                    onToChange={setDateTo}
                  />
                </FilterTh>
                <PlainTh>Total</PlainTh>
                <FilterTh label="Statut">
                  <HeaderSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    aria-label="Filtrer par statut"
                    options={[
                      { value: '', label: 'Tous' },
                      { value: 'draft', label: 'Brouillon' },
                      { value: 'sent', label: 'Envoyée' },
                      { value: 'paid', label: 'Payée' },
                      { value: 'partial', label: 'Partielle' },
                      { value: 'void', label: 'Annulée' },
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
                    {t('invoices.noneMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.id} className="group hover:bg-muted/50">
                    <td className="px-3 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-3 py-3">{inv.partners?.legal_name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-3">{formatCad(inv.total)}</td>
                    <td className="px-3 py-3">
                      <Badge label={inv.status} tone={inv.status} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <ViewIconButton className={iconActionRevealClassName} label={t('common.view')} onClick={() => viewDetail(inv)} />
                        <DeleteIconButton className={iconActionRevealClassName} label={t('common.delete')} onClick={() => handleDelete(inv)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}

      <Modal title={t('invoices.create')} open={createOpen} onClose={() => setCreateOpen(false)} wide>
        <div className="space-y-4">
          <Field label="Partenaire (client)">
            <select
              className={inputClass}
              value={createPartnerId}
              onChange={async (e) => {
                setCreatePartnerId(e.target.value)
                await loadUnbilled(e.target.value)
              }}
            >
              {billablePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.legal_name}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={includeSalesTax}
              onChange={(e) => setIncludeSalesTax(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t('invoices.includeTax')}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t('invoices.includeTaxHint')}
              </span>
            </span>
          </label>
          {includeSalesTax && !taxesEnabledInSettings && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {t('invoices.taxNotEnabled')}
            </p>
          )}

          {nothingToBill ? (
            <p className="text-sm text-muted-foreground">Aucun temps ni forfait non facturé pour ce partenaire.</p>
          ) : (
            <>
              {unbilledFixed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Projets forfaitaires</p>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {unbilledFixed.map((p) => (
                      <label key={p.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.has(p.id)}
                          onChange={(ev) => {
                            const next = new Set(selectedProjectIds)
                            if (ev.target.checked) next.add(p.id)
                            else next.delete(p.id)
                            setSelectedProjectIds(next)
                          }}
                          className="mt-1"
                        />
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-muted-foreground text-xs">Forfait</div>
                        </div>
                        <div className="text-sm font-medium">{formatCad(Number(p.fixed_price ?? 0))}</div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {unbilled.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Feuilles de temps (horaire)</p>
                  <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                    {unbilled.map((e) => {
                      const p = e.projects!
                      const hours =
                        (e.time_entry_lines ?? []).length > 0
                          ? totalLineHours(e.time_entry_lines ?? [])
                          : Number(e.hours)
                      const amt = sheetBillableAmount(e, p)
                      return (
                        <label key={e.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedEntryIds.has(e.id)}
                            onChange={(ev) => {
                              const next = new Set(selectedEntryIds)
                              if (ev.target.checked) next.add(e.id)
                              else next.delete(e.id)
                              setSelectedEntryIds(next)
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{p.name}</div>
                            <div className="text-muted-foreground text-xs">
                              {formatDate(e.entry_date)} · {hours.toFixed(2)} h · {sheetSummary(e.time_entry_lines ?? [])}
                            </div>
                          </div>
                          <div className="text-sm font-medium">{formatCad(amt)}</div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {canCreate && settings && (
                <div className="bg-muted rounded-lg p-3 text-sm space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Aperçu
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left py-1">Description</th>
                          <th className="text-right py-1">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewLines().map((line, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1 pr-2">{line.description}</td>
                            <td className="py-1 text-right">{formatCad(line.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-right space-y-0.5 pt-2 border-t border-border">
                    <div>{t('invoices.subtotal')} : {formatCad(preview.subtotal)}</div>
                    {showTaxesOnInvoice &&
                      invoiceTaxDisplayRows(
                        preview,
                        partners.find((p) => p.id === createPartnerId)?.province,
                        { gst: t('invoices.taxGst'), qst: t('invoices.taxQst'), hst: t('invoices.taxHst') }
                      ).map((row) => (
                        <div key={row.label}>
                          {row.label} : {formatCad(row.amount)}
                        </div>
                      ))}
                    <div className="font-semibold">{t('invoices.total')} : {formatCad(preview.total)}</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setCreateOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={createInvoice} disabled={!canCreate}>
                  {t('invoices.createAction')}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal title={selected?.invoice_number ?? 'Facture'} open={detailOpen} onClose={() => setDetailOpen(false)} wide>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground text-xs">Partenaire</div>
                <div className="font-medium">{selected.partners?.legal_name}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Échéance</div>
                <div>{formatDate(selected.due_date)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Devise</div>
                <div>{selected.currency || DEFAULT_CURRENCY}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Langue PDF</div>
                <div>
                  {INVOICE_LANGUAGE_LABELS[partnerInvoiceLanguage(partners.find((p) => p.id === selected.partner_id) ?? null)]}
                </div>
              </div>
              {invoicePoNumbers.length > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs">N° bon de commande (PO)</div>
                  <div className="font-medium">{invoicePoNumbers.join(', ')}</div>
                </div>
              )}
            </div>

            <LineItemsTable lines={lineItems} />

            <div className="text-right space-y-1 border-t border-border pt-3">
              <div>{t('invoices.subtotal')} : {formatCad(selected.subtotal)}</div>
              {(selected.include_sales_tax ?? false) &&
                (Number(selected.gst) > 0 || Number(selected.qst) > 0) &&
                invoiceTaxDisplayRows(
                  { gst: Number(selected.gst), qst: Number(selected.qst) },
                  partners.find((p) => p.id === selected.partner_id)?.province,
                  { gst: t('invoices.taxGst'), qst: t('invoices.taxQst'), hst: t('invoices.taxHst') }
                ).map((row) => (
                  <div key={row.label}>
                    {row.label} : {formatCad(row.amount)}
                  </div>
                ))}
              <div className="font-semibold text-lg">{t('invoices.total')} : {formatCad(selected.total)}</div>
            </div>

            <DocumentAttachments
              key={`${selected.id}-${docVersion}`}
              entityType="invoice"
              entityId={selected.id}
              label="Facture PDF / pièces jointes"
              hint="Enregistrez le PDF généré ou joignez une copie signée."
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between pt-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={handlePdf}>
                  {t('invoices.downloadPdf')}
                </Button>
                <InvoiceStripeLinkButton
                  invoiceId={selected.id}
                  disabled={selected.status === 'void' || selected.status === 'paid'}
                />
                <Button variant="secondary" onClick={() => void handleSavePdf()} disabled={savingPdf}>
                  {savingPdf ? t('invoices.savingPdf') : t('invoices.savePdf')}
                </Button>
                <Button variant="danger" onClick={() => handleDelete(selected)}>
                  {t('invoices.delete')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['draft', 'sent', 'void'] as InvoiceStatus[]).map((s) => (
                  <Button
                    key={s}
                    variant={selected.status === s ? 'primary' : 'secondary'}
                    className="!text-xs"
                    onClick={() => updateStatus(selected.id, s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
      {embedded && (
        <WorkflowFooter to="/bank" label="Encaisser le paiement dans Banque">
          Facture envoyée ?
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
