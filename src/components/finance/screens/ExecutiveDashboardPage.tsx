'use client'

import { useState, useTransition } from 'react'
import { Link } from '@/i18n/navigation'
import { loadExecutiveDashboardAction } from '@/app/actions/finance-dashboard'
import { formatCad } from '@/lib/finance/format'
import type { MomChange } from '@/lib/finance/dashboardKpis'
import type { ExecutiveDashboardSnapshot } from '@/lib/finance/load-executive-dashboard'
import { RevenueTrendChart } from '@/components/finance/DashboardCharts'
import { ExecutiveBreakdownPanel } from '@/components/finance/ExecutiveBreakdownPanel'
import { TrendBadge } from '@/components/finance/MetricCard'
import { UpcomingDeadlinesCard } from '@/components/finance/UpcomingDeadlinesCard'
import { NativeSelect } from '@/components/ui/native-select'
import {
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from '@/components/layout/list-layout'
import { useTranslations } from 'next-intl'

function ActivityMetricRow({
  label,
  value,
  sub,
  trend,
  to,
}: {
  label: string
  value: string
  sub?: string
  trend?: MomChange
  to: string
}) {
  return (
    <Link
      href={to}
      className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0 -mx-1 px-1 rounded-lg hover:bg-muted"
    >
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
        {trend && (
          <div className="mt-0.5 flex justify-end">
            <TrendBadge change={trend} label="" />
          </div>
        )}
      </div>
    </Link>
  )
}

function DuesLine({
  label,
  value,
  to,
}: {
  label: string
  value: string
  to?: string
}) {
  const inner = (
    <>
      <span className="text-foreground">{label}</span>
      <span className="tabular-nums font-medium text-foreground">{value}</span>
    </>
  )
  const className = 'flex items-center justify-between gap-3 text-sm py-0.5'
  if (to) {
    return (
      <Link href={to} className={`${className} rounded-md -mx-1 px-1 hover:bg-muted`}>
        {inner}
      </Link>
    )
  }
  return <div className={className}>{inner}</div>
}

export function ExecutiveDashboardPage({
  initialSnapshot,
}: {
  initialSnapshot: ExecutiveDashboardSnapshot
}) {
  const t = useTranslations('financeApp')
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const {
    period,
    presets,
    worked,
    invoiced,
    recognized,
    collected,
    collectionRate,
    dues,
    cumulativeSeries,
    hasTrend,
    trends,
    partnerRows,
    serviceRows,
    deadlines,
  } = snapshot

  function onPeriodIndex(index: number) {
    const next = presets[index]
    if (!next) return
    startTransition(async () => {
      try {
        setError(null)
        setSnapshot(await loadExecutiveDashboardAction(next))
      } catch (err) {
        setError(err instanceof Error ? err.message : t('dashboard.duesCalcError'))
      }
    })
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-border bg-surface p-6 shadow-elevated">
        <h1 className="text-lg font-semibold">{t('dashboard.executiveTitle')}</h1>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  const remainingTone =
    dues.estimatedRemaining < 0 ? 'text-destructive' : dues.totalDue > 0 ? 'text-foreground' : 'text-brand'

  return (
    <div className={`space-y-5 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className={listPageHeaderClassName}>
          <h1 className={listPageTitleClassName}>{t('dashboard.executiveTitle')}</h1>
          <p className={listPageSubtitleClassName}>{t('dashboard.executiveSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            density="dense"
            value={String(
              presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end),
            )}
            onChange={(e) => onPeriodIndex(Number(e.target.value))}
            aria-label={t('dashboard.period')}
            disabled={pending}
          >
            {presets.map((p, i) => (
              <option key={p.label} value={String(i)}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
          <Link
            href="/dashboard/details"
            className="text-sm font-medium px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:border-ring/50 min-h-[36px] inline-flex items-center"
          >
            {t('common.detailsLink')}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="ui-card px-3 py-2.5 h-full flex flex-col">
          <div className="ui-metric-label leading-tight mb-1">{t('dashboard.activity')}</div>
          <div className="divide-y divide-border flex-1">
            <ActivityMetricRow
              label={t('dashboard.workedRevenue')}
              value={formatCad(worked.total)}
              sub={t('dashboard.workedHoursFixed', { hours: worked.hours, fixed: formatCad(worked.fixed) })}
              trend={trends.workedRevenue}
              to="/engagements/time"
            />
            <ActivityMetricRow
              label={t('dashboard.invoicedRevenue')}
              value={formatCad(invoiced)}
              sub={t('dashboard.invoicedHtGl', { amount: formatCad(recognized) })}
              trend={trends.invoicedRevenue}
              to="/engagements/invoices"
            />
            <ActivityMetricRow
              label={t('dashboard.collections')}
              value={formatCad(collected)}
              sub={
                collectionRate != null
                  ? t('dashboard.collectedPct', { rate: collectionRate.toFixed(1) })
                  : t('dashboard.clientPayments')
              }
              trend={trends.cashCollected}
              to="/engagements/invoices"
            />
          </div>
        </div>

        <div className="ui-card px-3 py-2.5 h-full flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <div className="ui-metric-label leading-tight">{t('dashboard.estimatedDues')}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('dashboard.duesSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 flex-1">
            <DuesLine
              label={t('dashboard.bankCash')}
              value={formatCad(dues.cash)}
              to="/bank"
            />
            <DuesLine
              label={t('dashboard.contributionsDue')}
              value={formatCad(dues.payrollUnpaid)}
              to="/compensation/payroll"
            />
            <DuesLine label={t('dashboard.salesTaxDue')} value={formatCad(dues.salesTaxUnpaid)} to="/sales-tax" />
            <DuesLine label={t('dashboard.corpTaxDue')} value={formatCad(dues.companyTaxUnpaid)} to="/corporate-tax" />
            <div className="border-t border-border mt-1.5 pt-1.5 space-y-0.5">
              <DuesLine label={t('dashboard.totalToPay')} value={formatCad(dues.totalDue)} />
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <span className="text-sm font-semibold">{t('dashboard.estimatedBalance')}</span>
                <span className={`text-lg font-semibold tabular-nums leading-tight ${remainingTone}`}>
                  {formatCad(dues.estimatedRemaining)}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
            {dues.cashFromBankImport ? t('dashboard.importedStatementBalance') : t('dashboard.glBalanceNoStatement')}
            {' · '}
            TPS/TVQ et impôt sur factures encaissées · impôt = (ventes HT encaissées − salaires − coûts) ×{' '}
            {(dues.corpTaxRate * 100).toFixed(1)} % (brouillon).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <div className="xl:col-span-2">
          {hasTrend ? (
            <RevenueTrendChart points={cumulativeSeries} cumulative compact />
          ) : (
            <div className="ui-card px-4 py-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noTrendData')}
            </div>
          )}
        </div>
        <UpcomingDeadlinesCard rows={deadlines} compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExecutiveBreakdownPanel title={t('dashboard.byClient')} rows={partnerRows} emptyMessage={t('dashboard.noClientActivity')} dense />
        <ExecutiveBreakdownPanel
          title={t('dashboard.byServiceType')}
          rows={serviceRows}
          emptyMessage={t('dashboard.noServiceActivity')}
          dense
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('dashboard.draftProrata')}
      </p>
    </div>
  )
}
