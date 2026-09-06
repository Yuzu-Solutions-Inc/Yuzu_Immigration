'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from '@/i18n/navigation'
import { formatCad } from '@/lib/finance/format'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { CompensationWorkflowNav, type CompensationStep } from '@/components/finance/CompensationWorkflowNav'
import { db } from '@/lib/finance/db'
import {
  fetchCompensationMetrics,
  type CompensationMetrics,
} from '@/lib/finance/screen-data'
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

export function CompensationPage({
  children,
  initialMetrics,
}: {
  children?: ReactNode
  initialMetrics?: CompensationMetrics
}) {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const current = stepFromPath(pathname)
  const onEmployees = pathname.endsWith('/employees')
  const [metrics, setMetrics] = useState<CompensationMetrics>(
    initialMetrics ?? {
      activeEmployees: 0,
      payrollCostYtd: 0,
      dividendsYtd: 0,
    },
  )

  useEffect(() => {
    if (initialMetrics) return
    void loadMetrics()
  }, [])

  async function loadMetrics() {
    setMetrics(await fetchCompensationMetrics(db))
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
