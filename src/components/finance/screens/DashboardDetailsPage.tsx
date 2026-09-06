'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { formatCad } from '@/lib/finance/format'
import { buildFinancialSnapshot, type FinancialSnapshot } from '@/lib/finance/financials'
import { fetchFinancialReportExtras, fetchGeneralLedgerData } from '@/lib/finance/glDataLoader'
import { buildMonthlySeries, cumulativeMonthlySeries, hasChartData, seriesInSelectedPeriod } from '@/lib/finance/dashboardSeries'
import { computeUnbilledWip } from '@/lib/finance/billingMetrics'
import {
  averageRate,
  buildServiceKpiTrends,
  computeWorkedRevenueMetrics,
  operatingMarginPct,
} from '@/lib/finance/dashboardKpis'
import { fetchDashboardBillingData } from '@/lib/finance/dashboardData'
import { useDashboardPeriod } from '@/components/finance/hooks/useDashboardPeriod'
import type { OrganizationSettings } from '@/lib/finance/types'
import {
  CapitalChart,
  CashFlowChart,
  PayrollTrendChart,
  ProfitabilityChart,
  RevenueTrendChart,
} from '@/components/finance/DashboardCharts'
import { DashboardSection, KpiCard, MetricGrid } from '@/components/finance/MetricCard'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

export function DashboardDetailsPage() {
  const t = useTranslations('financeApp')
  const { period, setPeriod, presets, settings, ready } = useDashboardPeriod()
  const [fin, setFin] = useState<FinancialSnapshot | null>(null)
  const [ops, setOps] = useState({ partners: 0, unbilledHours: 0, unbilledAmount: 0, pendingReimbursement: 0 })
  const [worked, setWorked] = useState({ total: 0, hourly: 0, fixed: 0, hours: 0, hourlyHours: 0, fixedHours: 0 })
  const [chartSource, setChartSource] = useState<Parameters<typeof buildMonthlySeries>[0] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (period) loadAll(period, settings ?? undefined)
  }, [period, settings])

  async function loadAll(range: NonNullable<typeof period>, orgSettings?: OrganizationSettings) {
    setLoading(true)
    setError(null)
    try {
      const billing = await fetchDashboardBillingData()
      const [{ data: glData, warnings: glWarnings }, extras, settingsResult, partners, employeeExpensesPending] =
        await Promise.all([
          fetchGeneralLedgerData(),
          fetchFinancialReportExtras(),
          orgSettings ? Promise.resolve({ data: orgSettings }) : db.from('organization_settings').select('*').maybeSingle(),
          db.from('partners').select('id', { count: 'exact', head: true }),
          db.from('employee_expenses').select('total, payroll_run_id').is('payroll_run_id', null),
        ])

      if (glWarnings.length > 0) console.warn('GL load:', glWarnings.join('; '))

      const wip = computeUnbilledWip(billing.timeEntries, billing.fixedProjects)
      const workedMetrics = computeWorkedRevenueMetrics(billing.timeEntries, range)

      setWorked(workedMetrics)
      setOps({
        partners: partners.count ?? 0,
        unbilledHours: wip.hours,
        unbilledAmount: wip.amount,
        pendingReimbursement: (employeeExpensesPending.data ?? []).reduce((s, e) => s + Number(e.total), 0),
      })

      setChartSource({
        payments: glData.payments,
        expenses: glData.expenses,
        payrollRuns: glData.payrollRuns,
        invoices: glData.invoices,
        timeEntries: billing.timeEntries,
        dividends: glData.dividends,
        corporateTax: glData.corporateTax,
        salesTaxRemitted: extras.salesTaxRemitted,
        settings: settingsResult.data ?? undefined,
      })

      setFin(
        buildFinancialSnapshot(
          {
            ...glData,
            bankTransactions: extras.bankTransactions,
            settings: settingsResult.data ?? glData.settings ?? undefined,
          },
          range
        )
      )
    } catch (err) {
      console.error('Dashboard details load failed:', err)
      setFin(null)
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du tableau de bord.')
    } finally {
      setLoading(false)
    }
  }

  const monthlySeries = useMemo(() => {
    if (!chartSource || !period) return []
    return buildMonthlySeries(chartSource, period)
  }, [chartSource, period])

  const chartSeries = useMemo(() => (period ? seriesInSelectedPeriod(monthlySeries, period) : monthlySeries), [monthlySeries, period])
  const cumulativeSeries = useMemo(() => cumulativeMonthlySeries(chartSeries), [chartSeries])

  const trends = useMemo(() => buildServiceKpiTrends(monthlySeries), [monthlySeries])

  if (!ready || !period || loading || !fin) {
    if (error) {
      return (
        <div className="max-w-xl mx-auto ui-card p-6 space-y-3">
          <h1 className="text-lg font-semibold">{t('dashboard.detailsTitle')}</h1>
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            className="text-sm font-medium px-3 py-2 rounded-lg border border-border bg-surface hover:border-ring/50"
            onClick={() => period && loadAll(period, settings ?? undefined)}
          >
            {t('dashboard.retry')}
          </button>
        </div>
      )
    }
    return <div className="text-muted-foreground">{t('dashboard.loading')}</div>
  }

  const eq = fin.balanceSheet.equity
  const invoicedRevenue = fin.income.invoicedSubtotal
  const recognizedRevenue = fin.income.revenueSubtotal
  const billingGap = Math.round((worked.total - invoicedRevenue) * 100) / 100
  const margin = operatingMarginPct(recognizedRevenue, fin.income.operatingIncome)
  const periodNetCash = fin.cashIn - fin.cashOut
  const bankVariance = fin.balanceSheet.bankReconciliationVariance
  const hourlyAvg = averageRate(worked.hourly, worked.hourlyHours)
  const fixedAvg = averageRate(worked.fixed, worked.fixedHours)

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto pb-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold leading-tight">{t('dashboard.detailsTitle')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Indicateurs complets — {period.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-surface min-h-[36px]"
            value={presets.findIndex((p) => p.label === period.label && p.start === period.start && p.end === period.end)}
            onChange={(e) => setPeriod(presets[Number(e.target.value)])}
          >
            {presets.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <Link
            href="/home"
            className="text-sm font-medium px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:border-ring/50 min-h-[36px] inline-flex items-center"
          >
            {t('common.backToExecutive')}
          </Link>
          <Link href="/financial-reports" className="text-sm text-brand hover:underline font-medium">
            {t('common.reportsLink')}
          </Link>
        </div>
      </div>

      <DashboardSection title={t('dashboard.revenueAndWork')}>
        <MetricGrid cols={4} dense>
          <KpiCard
            dense
            label={t('dashboard.workedRevenue')}
            value={formatCad(worked.total)}
            sub={t('dashboard.workedHoursBreakdown', { hours: worked.hours, hourly: formatCad(worked.hourly), fixed: formatCad(worked.fixed) })}
            trend={trends.workedRevenue}
            to="/engagements/time"
          />
          <KpiCard
            dense
            label={t('dashboard.invoicedRevenue')}
            value={formatCad(invoicedRevenue)}
            sub={
              Math.abs(invoicedRevenue - recognizedRevenue) > 0.01
                ? t('dashboard.invoicedHtDate', { amount: formatCad(recognizedRevenue) })
                : t('dashboard.htOnPeriod')
            }
            trend={trends.invoicedRevenue}
            to="/engagements/invoices"
          />
          <KpiCard
            dense
            label={t('dashboard.collections')}
            value={formatCad(fin.cashIn)}
            sub={
              fin.billing.collectionRatePct != null
                ? t('dashboard.collectedPct', { rate: fin.billing.collectionRatePct.toFixed(1) })
                : t('dashboard.clientPaymentsPeriod')
            }
            trend={trends.cashCollected}
            to="/engagements/invoices"
          />
          <KpiCard
            dense
            label={t('dashboard.workBillingGap')}
            value={formatCad(billingGap)}
            sub={billingGap > 0 ? t('dashboard.unbilledWork') : billingGap < 0 ? t('dashboard.billedBeyondTime') : t('dashboard.aligned')}
            to="/engagements/invoices"
          />
        </MetricGrid>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <KpiCard
            dense
            label={t('common.perHourAvgHourly')}
            value={hourlyAvg != null ? `${formatCad(hourlyAvg)}/h` : t('common.dash')}
            sub={t('dashboard.hourlyHoursOnPeriod', { hours: worked.hourlyHours })}
          />
          <KpiCard
            dense
            label={t('common.perHourAvgFixed')}
            value={fixedAvg != null ? `${formatCad(fixedAvg)}/h` : t('common.dash')}
            sub={t('dashboard.fixedHoursInternal', { hours: worked.fixedHours })}
          />
        </div>
      </DashboardSection>

      <DashboardSection title={t('dashboard.profitability')}>
        <MetricGrid cols={4} dense>
          <KpiCard
            dense
            label={t('dashboard.operatingIncome')}
            value={formatCad(fin.income.operatingIncome)}
            sub={t('dashboard.operatingIncomeHint')}
            trend={trends.operatingIncome}
            to="/financial-reports"
          />
          <KpiCard dense label={t('dashboard.operatingMargin')} value={margin != null ? t('dashboard.marginPct', { pct: margin.toFixed(1) }) : t('common.dash')} sub={t('dashboard.marginHint')} />
          <KpiCard dense label={t('dashboard.operatingExpenses')} value={formatCad(fin.income.operatingExpenses)} sub={t('dashboard.exPayroll')} to="/expenses" />
          <KpiCard
            dense
            label={t('dashboard.accountsReceivable')}
            value={formatCad(fin.accountsReceivable)}
            sub={
              fin.billing.collectionRatePct != null
                ? t('dashboard.arHint', { rate: fin.billing.collectionRatePct.toFixed(1) })
                : t('dashboard.glCumulative')
            }
            to="/engagements/invoices"
          />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title={t('dashboard.payrollAndCharges')}>
        <MetricGrid cols={4} dense>
          <KpiCard dense label={t('dashboard.grossPay')} value={formatCad(fin.income.payrollGross)} sub={t('dashboard.compOnPeriod')} to="/payroll" />
          <KpiCard dense label={t('dashboard.employerContributions')} value={formatCad(fin.income.employerPayrollContributions)} sub={t('dashboard.employerContribHint')} to="/payroll" />
          <KpiCard dense label={t('dashboard.totalPayrollCost')} value={formatCad(fin.payrollYtd)} sub={t('dashboard.grossPlusEmployer')} trend={trends.payrollTotal} to="/payroll" />
          <KpiCard dense label={t('dashboard.pendingRemittances')} value={formatCad(fin.balanceSheet.payrollRemittancesPending)} sub={t('dashboard.pendingRemittancesHint')} to="/payroll" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title={t('dashboard.treasury')}>
        <MetricGrid cols={4} dense>
          <KpiCard
            dense
            label={t('dashboard.bookCash')}
            value={formatCad(fin.balanceSheet.cash)}
            sub={
              bankVariance != null && Math.abs(bankVariance) > 0.01
                ? t('dashboard.bookCashHint', { amount: formatCad(bankVariance) })
                : t('dashboard.glCumulative')
            }
            to="/bank"
          />
          <KpiCard dense label={t('dashboard.netFlowPeriod')} value={formatCad(periodNetCash)} sub={t('dashboard.inOut', { in: formatCad(fin.cashIn), out: formatCad(fin.cashOut) })} />
          <KpiCard dense label={t('dashboard.totalEquity')} value={formatCad(fin.equity)} sub={t('dashboard.equityHint')} to="/financial-reports" />
          <KpiCard dense label={t('dashboard.salesTaxPayable')} value={formatCad(fin.salesTaxPayable)} sub={t('dashboard.gstQstNet')} to="/sales-tax" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title={t('dashboard.billingPipeline')}>
        <MetricGrid cols={4} dense>
          <KpiCard dense label={t('dashboard.activePartners')} value={String(ops.partners)} to="/partners" />
          <KpiCard dense label={t('dashboard.unbilledHours')} value={`${ops.unbilledHours} h`} sub={t('dashboard.unbilledHoursHint')} to="/engagements/time" />
          <KpiCard dense label={t('dashboard.wipToBill')} value={formatCad(ops.unbilledAmount)} sub={t('dashboard.wipToBillHint')} to="/engagements/invoices" />
          <KpiCard dense label={t('dashboard.pendingReimb')} value={formatCad(ops.pendingReimbursement)} to="/employee-expenses" />
        </MetricGrid>
      </DashboardSection>

      <DashboardSection title={t('dashboard.trends', { period: period.label })}>
        {hasChartData(chartSeries) ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <RevenueTrendChart points={cumulativeSeries} cumulative compact />
            <ProfitabilityChart points={chartSeries} />
            <CashFlowChart points={chartSeries} />
            <PayrollTrendChart points={chartSeries} />
            <div className="xl:col-span-2">
              <CapitalChart points={chartSeries} equity={eq} openingCash={Number(settings?.opening_cash_balance ?? 0)} />
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
            {t('dashboard.chartsEmpty')}
          </div>
        )}
      </DashboardSection>

      <p className="text-[11px] text-muted-foreground pb-1">
        {t('dashboard.detailsDisclaimer')}
      </p>
    </div>
  )
}
