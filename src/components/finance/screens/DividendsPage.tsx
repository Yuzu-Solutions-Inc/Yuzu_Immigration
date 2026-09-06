'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { useFinanceOutlet } from '@/components/finance/finance-outlet'
import type { Dividend, Shareholder } from '@/lib/finance/types'
import { formatCad, formatDate, todayIso } from '@/lib/finance/format'
import { inDateRange, matchesSearch } from '@/lib/finance/filters'
import { splitDividendByShares } from '@/lib/finance/payrollCalc'
import { Button, tableActionClass } from '@/components/finance/Button'
import { Badge } from '@/components/finance/Badge'
import { DataTable } from '@/components/finance/DataTable'
import { Modal } from '@/components/finance/Modal'
import { Field, inputClass } from '@/components/finance/Field'
import { EmptyState } from '@/components/finance/EmptyState'
import {
  FilterSummary,
  FilterTh,
  HeaderDateRange,
  HeaderSearch,
  PlainTh,
} from '@/components/finance/ColumnFilters'
import { PageHeader } from '@/components/finance/PageHeader'
import { StepActionBar } from '@/components/finance/WorkflowNav'
import { WorkflowFooter } from '@/components/finance/WorkflowFooter'
import { PageShell } from '@/components/finance/PageShell'
import { AlertBanner } from '@/components/finance/AlertBanner'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

type CompensationOutletContext = { refreshMetrics?: () => void }

const emptyForm = {
  declared_date: todayIso(),
  total_amount: 0,
  description: '',
  notes: '',
}

export function DividendsPage() {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const embedded = pathname.startsWith('/compensation')
  const { refreshMetrics } = useFinanceOutlet<CompensationOutletContext>() ?? {}
  const { blockIfClosed } = usePeriodCloseGuard()
  const [rows, setRows] = useState<Dividend[]>([])
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<Dividend | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const activeShareholders = shareholders.filter((s) => s.active)
  const activeCount = activeShareholders.length

  const filtered = useMemo(() => {
    return rows.filter((d) => {
      if (!inDateRange(d.declared_date, dateFrom, dateTo)) return false
      return matchesSearch(search, d.description, d.notes, d.total_amount, d.amount_per_employee)
    })
  }, [rows, search, dateFrom, dateTo])

  const hasFilters = !!(search || dateFrom || dateTo)
  const previewPerShareholder =
    form.total_amount > 0 && activeCount > 0
      ? splitDividendByShares(form.total_amount, activeShareholders)[0]
      : 0

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [div, sh] = await Promise.all([
      db
        .from('dividends')
        .select('*, dividend_allocations(id, amount, shareholder_id, employee_id, shareholders(legal_name), employees(first_name, last_name))')
        .order('declared_date', { ascending: false }),
      db.from('shareholders').select('*').eq('active', true).order('legal_name'),
    ])
    setRows((div.data as Dividend[]) ?? [])
    setShareholders((sh.data as Shareholder[]) ?? [])
    refreshMetrics?.()
  }

  function openNew() {
    if (activeCount === 0) {
      alert('Ajoutez au moins un actionnaire actif avant de déclarer des dividendes.')
      return
    }
    setForm(emptyForm)
    setOpen(true)
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault()
    if (activeCount === 0) {
      alert('Ajoutez au moins un actionnaire actif avant de déclarer des dividendes.')
      return
    }

    const declaredDate = form.declared_date || todayIso()
    if (!declaredDate) {
      alert('Indiquez une date de déclaration.')
      return
    }
    if (blockIfClosed(declaredDate)) return

    const amounts = splitDividendByShares(form.total_amount, activeShareholders)
    const perShareholder = amounts[0]

    const { data: dividend, error } = await db
      .from('dividends')
      .insert({
        declared_date: declaredDate,
        status: 'declared',
        total_amount: form.total_amount,
        employee_count: activeCount,
        amount_per_employee: perShareholder,
        description: form.description || null,
        notes: form.notes || null,
      })
      .select()
      .single()

    if (error || !dividend) {
      alert(error?.message ?? 'Erreur')
      return
    }

    const allocations = activeShareholders.map((s, i) => ({
      dividend_id: dividend.id,
      shareholder_id: s.id,
      employee_id: s.employee_id,
      amount: amounts[i],
    }))
    const { error: allocErr } = await db.from('dividend_allocations').insert(allocations)
    if (allocErr) {
      alert(allocErr.message)
      return
    }

    setOpen(false)
    load()
  }

  async function remove(id: string) {
    const row = rows.find((r) => r.id === id)
    if (row?.status === 'paid') {
      alert('Dividende déjà payé — désaffectez la transaction bancaire avant de supprimer.')
      return
    }
    if (!confirm(t('dividends.confirmDelete'))) return
    if (row && blockIfClosed(row.declared_date, row.payment_date)) return
    await db.from('dividends').delete().eq('id', id)
    setDetailOpen(false)
    setSelected(null)
    load()
  }

  function viewDetail(d: Dividend) {
    setSelected(d)
    setDetailOpen(true)
  }

  const totalDistributed = filtered.reduce((s, d) => s + Number(d.total_amount), 0)
  const declareBtn = (
    <Button onClick={openNew} disabled={activeCount === 0}>
      {t('dividends.declare')}
    </Button>
  )

  const clearFilters = () => {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  const content = (
    <>
      {embedded ? (
        rows.length === 0 && <StepActionBar actions={declareBtn} />
      ) : (
        <PageHeader
          title={t('dividends.title')}
          subtitle={
            <>
              Répartis entre {activeCount} actionnaire{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''}
              {hasFilters
                ? t('dividends.totalFiltered', { amount: formatCad(totalDistributed) })
                : rows.length > 0
                  ? t('dividends.total', { amount: formatCad(rows.reduce((s, d) => s + Number(d.total_amount), 0)) })
                  : ''}
            </>
          }
          actions={declareBtn}
        />
      )}
      {embedded && (
        <p className="text-sm text-muted-foreground">
          Répartis entre {activeCount} actionnaire{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''}
          {rows.length > 0 ? ` · Total : ${formatCad(rows.reduce((s, d) => s + Number(d.total_amount), 0))}` : ''}
        </p>
      )}

      {activeCount === 0 && (
        <AlertBanner>
          Aucun actionnaire actif —{' '}
          <Link href="/compensation/shareholders" className="font-medium underline">
            ajoutez un actionnaire
          </Link>{' '}
          avant de distribuer des dividendes.
        </AlertBanner>
      )}

      {rows.length === 0 ? (
        <EmptyState message={t('dividends.empty')} />
      ) : (
        <>
          <FilterSummary
            resultCount={filtered.length}
            totalCount={rows.length}
            hasFilters={hasFilters}
            onClear={clearFilters}
            actions={embedded ? declareBtn : undefined}
          />
          <DataTable minWidth={900}>
            <thead className="bg-muted text-left">
              <tr>
                <FilterTh label="Déclaré le">
                  <HeaderDateRange
                    from={dateFrom}
                    to={dateTo}
                    onFromChange={setDateFrom}
                    onToChange={setDateTo}
                  />
                </FilterTh>
                <PlainTh>Statut</PlainTh>
                <PlainTh>Payé le</PlainTh>
                <PlainTh>Montant total</PlainTh>
                <PlainTh>Actionnaires</PlainTh>
                <PlainTh>Par action</PlainTh>
                <FilterTh label="Description">
                  <HeaderSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Description…"
                    aria-label="Filtrer par description"
                  />
                </FilterTh>
                <PlainTh className="w-px" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {t('dividends.noneMatch')}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50">
                    <td className="px-3 py-3">{formatDate(d.declared_date)}</td>
                    <td className="px-3 py-3">
                      <Badge
                        label={
                          d.status === 'paid' ? 'Payé' : Number(d.paid_amount) > 0 ? 'Partiel' : 'Déclaré'
                        }
                        tone={d.status === 'paid' ? 'paid' : 'declared'}
                      />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{d.payment_date ? formatDate(d.payment_date) : '—'}</td>
                    <td className="px-3 py-3 font-medium">
                      {formatCad(d.total_amount)}
                      {Number(d.paid_amount) > 0 && d.status !== 'paid' && (
                        <span className="text-muted-foreground text-xs block">payé {formatCad(d.paid_amount)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{d.employee_count}</td>
                    <td className="px-3 py-3">{formatCad(d.amount_per_employee)}</td>
                    <td className="px-3 py-3 text-muted-foreground">{d.description ?? '—'}</td>
                    <td className="px-3 py-3 text-right space-x-1">
                      <Button variant="ghost" className={tableActionClass} onClick={() => viewDetail(d)}>
                        Détail
                      </Button>
                      <Button variant="danger" className={tableActionClass} onClick={() => remove(d.id)}>
                        Suppr.
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}

      <Modal title={t('dividends.declare')} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <p className="text-sm text-muted-foreground">
            La déclaration réduit les bénéfices non répartis. Le paiement sera enregistré lors de la réconciliation bancaire.
          </p>
          <Field label="Date de déclaration *">
            <input type="date" className={inputClass} required value={form.declared_date} onChange={(e) => setForm({ ...form, declared_date: e.target.value })} />
          </Field>
          <Field label="Montant total à distribuer (CAD) *">
            <input type="number" step="0.01" min="0.01" className={inputClass} required value={form.total_amount || ''} onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })} />
          </Field>
          {form.total_amount > 0 && activeCount > 0 && (
            <div className="bg-action/10 rounded-lg p-3 text-sm">
              {activeCount} actionnaire{activeCount !== 1 ? 's' : ''} ·{' '}
              <strong>{formatCad(previewPerShareholder)}</strong> (répartition proportionnelle aux actions)
            </div>
          )}
          <Field label="Description">
            <input className={inputClass} placeholder="Dividende T2 2025" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={form.total_amount <= 0}>{t('dividends.declareAction')}</Button>
          </div>
        </form>
      </Modal>

      <Modal title={t('dividends.detailTitle')} open={detailOpen} onClose={() => setDetailOpen(false)}>
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground text-xs">Déclaré le</div>
                <div>{formatDate(selected.declared_date)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Statut</div>
                <Badge
                  label={selected.status === 'paid' ? 'Payé' : 'Déclaré'}
                  tone={selected.status === 'paid' ? 'paid' : 'declared'}
                />
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Payé le</div>
                <div>{selected.payment_date ? formatDate(selected.payment_date) : 'En attente (banque)'}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Total</div>
                <div className="font-medium">{formatCad(selected.total_amount)}</div>
              </div>
            </div>
            {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
            <table className="w-full">
              <thead className="text-muted-foreground text-left border-b border-border">
                <tr>
                  <th className="py-2">Actionnaire</th>
                  <th className="py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {(selected.dividend_allocations ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-border">
                    <td className="py-2">
                      {a.shareholders?.legal_name ??
                        (a.employees ? `${a.employees.first_name} ${a.employees.last_name}`.trim() : '—')}
                    </td>
                    <td className="py-2 text-right">{formatCad(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <Button variant="danger" onClick={() => remove(selected.id)}>{t('common.delete')}</Button>
            </div>
          </div>
        )}
      </Modal>
      {embedded && (
        <WorkflowFooter to="/bank" label="Marquer payé dans Banque">
          Dividende déclaré ?
        </WorkflowFooter>
      )}
    </>
  )

  if (embedded) {
    return <div className="space-y-3">{content}</div>
  }

  return <PageShell>{content}</PageShell>
}
