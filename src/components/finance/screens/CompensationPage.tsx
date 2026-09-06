'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from '@/i18n/navigation'
import { formatCad } from '@/lib/finance/format'
import { payrollEmployerTotal } from '@/lib/finance/financials'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { CompensationWorkflowNav, type CompensationStep } from '@/components/finance/CompensationWorkflowNav'
import { db } from '@/lib/finance/db'
import { FinanceOutletProvider } from '@/components/finance/finance-outlet'
import { useTranslations } from 'next-intl'

function stepFromPath(pathname: string): CompensationStep | undefined {
  if (pathname.endsWith('/dividends')) return 'dividends'
  if (pathname.endsWith('/payroll')) return 'payroll'
  return undefined
}

function MetricChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-semibold tabular-nums truncate">{value}</span>
    </div>
  )
}

export function CompensationPage({ children }: { children?: ReactNode }) {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const current = stepFromPath(pathname)
  const onEmployees = pathname.endsWith('/employees')
  const [metrics, setMetrics] = useState({
    activeEmployees: 0,
    payrollCostYtd: 0,
    dividendsYtd: 0,
  })

  useEffect(() => {
    loadMetrics()
  }, [pathname])

  async function loadMetrics() {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const [{ data: employees }, { data: payroll }, { data: dividends }] = await Promise.all([
      db.from('employees').select('id, active'),
      db
        .from('payroll_runs')
        .select(
          'payment_date, gross_pay, cpp_employer, ei_employer, qpip_employer, employer_benefits, federal_tax, provincial_tax, cpp_employee, ei_employee, qpip_employee, other_deductions'
        )
        .gte('payment_date', yearStart),
      db.from('dividends').select('total_amount, declared_date').gte('declared_date', yearStart),
    ])

    setMetrics({
      activeEmployees: (employees ?? []).filter((e) => e.active).length,
      payrollCostYtd: (payroll ?? []).reduce((s, p) => s + payrollEmployerTotal(p), 0),
      dividendsYtd: (dividends ?? []).reduce((s, d) => s + Number(d.total_amount), 0),
    })
  }

  if (onEmployees || pathname.endsWith('/shareholders')) {
    return (
      <PageShell width="wide" className="space-y-4">
        <FinanceOutletProvider value={{ refreshMetrics: loadMetrics }}>{children}</FinanceOutletProvider>
      </PageShell>
    )
  }

  const year = new Date().getFullYear()

  return (
    <PageShell width="wide" className="space-y-4">
      <PageHeader
        title={t('compensation.title')}
        subtitle={t('compensation.subtitle')}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <MetricChip label={t('compensation.activeEmployees')} value={metrics.activeEmployees} />
        <MetricChip label={t('compensation.payrollYear', { year })} value={formatCad(metrics.payrollCostYtd)} />
        <MetricChip label={t('compensation.dividendsYear', { year })} value={formatCad(metrics.dividendsYtd)} />
      </div>

      <CompensationWorkflowNav current={current} />

      <FinanceOutletProvider value={{ refreshMetrics: loadMetrics }}>{children}</FinanceOutletProvider>
    </PageShell>
  )
}
