'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatCad, formatDate, todayIso } from '@/lib/finance/format'
import { countActiveFilters, inDateRange } from '@/lib/finance/filters'
import {
  buildGeneralLedger,
  buildTrialBalance,
  CHART_OF_ACCOUNTS,
  flattenJournalEntries,
  journalTotals,
} from '@/lib/finance/generalLedger'
import { entriesThroughDate } from '@/lib/finance/ledgerBalances'
import { fetchGeneralLedgerData } from '@/lib/finance/glDataLoader'
import type { GeneralLedgerBuildInput } from '@/lib/finance/financials'
import { exportJournalCsv, exportTrialBalanceCsv } from '@/lib/finance/exportCsv'
import { DataTable } from '@/components/finance/DataTable'
import { EmptyState } from '@/components/finance/EmptyState'
import { DateRangeFilter, FilterSelect, ListToolbar, ViewToggle } from '@/components/finance/ListToolbar'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { Button } from '@/components/finance/Button'
import { useTranslations } from 'next-intl'

export function GeneralLedgerPage({
  initial,
}: {
  initial?: { data: GeneralLedgerBuildInput; warnings: string[] }
}) {
  const t = useTranslations('financeApp')
  const [glData, setGlData] = useState<GeneralLedgerBuildInput | null>(initial?.data ?? null)
  const [loading, setLoading] = useState(!initial)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [view, setView] = useState<'journal' | 'trial'>('journal')
  const [loadWarnings, setLoadWarnings] = useState<string[]>(initial?.warnings ?? [])

  useEffect(() => {
    if (initial) return
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, warnings } = await fetchGeneralLedgerData()
    setLoadWarnings(warnings)
    setGlData(data)
    setLoading(false)
  }

  const entries = useMemo(() => {
    if (!glData) return []
    const periodEnd = dateTo || todayIso()
    return buildGeneralLedger({
      ...glData,
      periodEnd,
      periodStart: dateFrom || undefined,
    })
  }, [glData, dateFrom, dateTo])

  const wipEnabled = Boolean(glData?.settings?.wip_accrual_enabled)
  const wipEntryCount = useMemo(() => entries.filter((e) => e.sourceType === 'wip_accrual').length, [entries])

  const journalEntries = useMemo(() => {
    return entries.filter((e) => {
      if (!inDateRange(e.date, dateFrom, dateTo)) return false
      if (accountFilter && !e.lines.some((l) => l.accountCode === accountFilter)) return false
      return true
    })
  }, [entries, dateFrom, dateTo, accountFilter])

  const trialEntries = useMemo(() => {
    const asOf = dateTo || '9999-12-31'
    let scoped = entriesThroughDate(entries, asOf)
    if (dateFrom) scoped = scoped.filter((e) => e.date >= dateFrom)
    if (accountFilter) scoped = scoped.filter((e) => e.lines.some((l) => l.accountCode === accountFilter))
    return scoped
  }, [entries, dateFrom, dateTo, accountFilter])

  const activeEntries = view === 'journal' ? journalEntries : trialEntries
  const flatLines = useMemo(() => flattenJournalEntries(journalEntries), [journalEntries])
  const trial = useMemo(() => buildTrialBalance(trialEntries), [trialEntries])
  const totals = useMemo(() => journalTotals(journalEntries), [journalEntries])

  const hasFilters = !!(dateFrom || dateTo || accountFilter)
  const trialAsOfLabel = dateTo ? t('ledger.balancesAt', { date: formatDate(dateTo) }) : t('ledger.balancesAll')

  if (loading) return <div className="text-muted-foreground">{t('ledger.loading')}</div>

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('ledger.title')}
        subtitle={t('ledger.subtitle')}
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              view === 'journal'
                ? exportJournalCsv(journalEntries)
                : exportTrialBalanceCsv(trial)
            }
          >
            {t('ledger.exportCsv')}
          </Button>
        }
      />

      {loadWarnings.length > 0 && (
        <div className="mb-4 space-y-2">
          {loadWarnings.map((msg) => (
            <p key={msg} className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {msg}
            </p>
          ))}
        </div>
      )}

      {glData && !wipEnabled && (
        <p className="mb-4 text-sm text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
          {t('ledger.wipOff')}
        </p>
      )}

      {wipEnabled && wipEntryCount === 0 && (
        <p className="mb-4 text-sm text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
          {t('ledger.wipOnNone')}
        </p>
      )}

      <ViewToggle
        value={view}
        onChange={setView}
        label={t('ledger.display')}
        options={[
          { value: 'journal', label: t('ledger.journal') },
          { value: 'trial', label: t('ledger.trial') },
        ]}
      />

      <ListToolbar
        hideSearch
        search=""
        onSearchChange={() => {}}
        resultCount={activeEntries.length}
        totalCount={entries.length}
        activeFilterCount={countActiveFilters(!!dateFrom, !!dateTo, !!accountFilter)}
        clearVisible={hasFilters}
        onClearFilters={() => {
          setDateFrom('')
          setDateTo('')
          setAccountFilter('')
        }}
      >
        <DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        <FilterSelect
          label={t('ledger.account')}
          value={accountFilter}
          onChange={setAccountFilter}
          options={[
            { value: '', label: t('ledger.allAccounts') },
            ...CHART_OF_ACCOUNTS.map((a) => ({ value: a.code, label: t('ledger.accountOption', { code: a.code, name: a.name }) })),
          ]}
        />
      </ListToolbar>

      {view === 'journal' ? (
        journalEntries.length === 0 ? (
          <EmptyState message={t('ledger.noEntries')} />
        ) : (
          <>
            <DataTable>
              <thead className="bg-muted text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-3 py-3">{t('ledger.date')}</th>
                  <th className="px-3 py-3">{t('ledger.ref')}</th>
                  <th className="px-3 py-3">{t('ledger.description')}</th>
                  <th className="px-3 py-3">{t('ledger.account')}</th>
                  <th className="px-3 py-3 text-right">{t('ledger.debit')}</th>
                  <th className="px-3 py-3 text-right">{t('ledger.credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {flatLines.map((line, i) => (
                  <tr key={`${line.entryId}-${line.accountCode}-${i}`} className="hover:bg-muted/50">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(line.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{line.reference}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="font-mono text-xs">{line.accountCode}</span> {line.accountName}
                    </td>
                    <td className="px-3 py-2 text-right">{line.debit > 0 ? formatCad(line.debit) : t('common.dash')}</td>
                    <td className="px-3 py-2 text-right">{line.credit > 0 ? formatCad(line.credit) : t('common.dash')}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="text-right text-sm font-medium space-x-4">
              <span>Total débits : {formatCad(totals.debit)}</span>
              <span>Total crédits : {formatCad(totals.credit)}</span>
              <span>Total crédits : {formatCad(totals.credit)}</span>
            </div>
          </>
        )
      ) : trial.length === 0 ? (
        <EmptyState message={t('ledger.noBalances')} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">{trialAsOfLabel}</p>
          <DataTable>
            <thead className="bg-muted text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-3">{t('ledger.account')}</th>
                <th className="px-3 py-3">{t('ledger.type')}</th>
                <th className="px-3 py-3 text-right">{t('ledger.debit')}</th>
                <th className="px-3 py-3 text-right">{t('ledger.credit')}</th>
                <th className="px-3 py-3 text-right">{t('ledger.balance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {trial.map((row) => (
                <tr key={row.accountCode}>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{row.accountCode}</span> {row.accountName}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.accountType}</td>
                  <td className="px-3 py-2 text-right">{row.debit > 0 ? formatCad(row.debit) : t('common.dash')}</td>
                  <td className="px-3 py-2 text-right">{row.credit > 0 ? formatCad(row.credit) : t('common.dash')}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCad(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      <section className="bg-muted border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-2 mt-6">
        <p className="font-medium text-foreground">{t('ledger.coa')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
          {CHART_OF_ACCOUNTS.map((a) => (
            <div key={a.code}>
              <span className="font-mono">{a.code}</span> {a.name}
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  )
}
