'use client'

import { useEffect, useState } from 'react'
import { buildFinancialSnapshot, type FinancialSnapshot } from '@/lib/finance/financials'
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from '@/lib/finance/glDataLoader'
import { fiscalYearEndFromSettings, periodPresets, type DateRange } from '@/lib/finance/fiscalPeriod'
import type { OrganizationSettings } from '@/lib/finance/types'
import {
  BalanceSheetStatement,
  CashFlowStatement,
  IncomeStatement,
} from '@/components/finance/FinancialStatements'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { Button } from '@/components/finance/Button'
import { ViewToggle } from '@/components/finance/ListToolbar'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'
import {
  downloadAllFinancialReportsPdf,
  downloadFinancialReportPdf,
  type FinancialReportKind,
} from '@/lib/finance/financialReportPdf'

type ReportView = FinancialReportKind

export function FinancialReportsPage() {
  const t = useTranslations('financeApp')
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [period, setPeriod] = useState<DateRange | null>(null)
  const [presets, setPresets] = useState<DateRange[]>([])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [view, setView] = useState<ReportView>('income')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (period) reloadFinancials(period)
  }, [period])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data: settingsRow } = await db.from('organization_settings').select('*').maybeSingle()
      const orgSettings = settingsRow ?? null
      setSettings(orgSettings)
      const { month: fyeMonth, day: fyeDay } = fiscalYearEndFromSettings(orgSettings)
      const ranges = periodPresets(fyeMonth, fyeDay)
      setPresets(ranges)
      const initial = ranges.find((r) => r.label.startsWith('AF')) ?? ranges[0]
      setPeriod(initial)
      await reloadFinancials(initial, orgSettings ?? undefined)
    } catch (err) {
      console.error('Financial reports load failed:', err)
      setError(err instanceof Error ? err.message : t('reports.loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function reloadFinancials(range: DateRange, orgSettings?: OrganizationSettings) {
    const [{ data: glData }, extras, settingsRow] = await Promise.all([
      fetchGeneralLedgerData(),
      fetchFinancialReportExtras(),
      orgSettings ? Promise.resolve({ data: orgSettings }) : db.from('organization_settings').select('*').maybeSingle(),
    ])

    setFin(
      buildFinancialSnapshot(
        {
          ...glData,
          bankTransactions: extras.bankTransactions,
          settings: settingsRow.data ?? glData.settings ?? undefined,
        },
        range
      )
    )
  }

  if (loading || !period) return <div className="text-muted-foreground">{t('reports.loading')}</div>

  if (error || !fin) {
    return (
      <PageShell>
        <div className="max-w-xl ui-card p-6 space-y-3">
          <h1 className="text-lg font-semibold">{t('reports.title')}</h1>
          <p className="text-sm text-red-700">{error ?? t('reports.unavailable')}</p>
          <Button type="button" onClick={() => load()}>
            {t('reports.retry')}
          </Button>
        </div>
      </PageShell>
    )
  }

  const periodLabel = period.label

  return (
    <PageShell>
      <PageHeader
        backTo={{ to: '/other', label: t('common.backToOther') }}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => downloadFinancialReportPdf(view, fin, settings)}>
              {t('reports.downloadPdf')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => downloadAllFinancialReportsPdf(fin, settings)}>
              {t('reports.allPdf')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'income', label: t('reports.income') },
            { value: 'balance-sheet', label: t('reports.balanceSheet') },
            { value: 'cash-flow', label: t('reports.cashFlow') },
          ]}
        />
        <select
          className="border border-border rounded-lg px-3 py-2 text-sm bg-surface min-h-[44px]"
          value={presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end)}
          onChange={(e) => setPeriod(presets[Number(e.target.value)])}
        >
          {presets.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        {view === 'income' && <IncomeStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'balance-sheet' && <BalanceSheetStatement fin={fin} periodLabel={periodLabel} />}
        {view === 'cash-flow' && <CashFlowStatement fin={fin} periodLabel={periodLabel} />}
      </div>
    </PageShell>
  )
}
