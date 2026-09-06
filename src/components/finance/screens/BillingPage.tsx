'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { formatCad } from '@/lib/finance/format'
import { computeUnbilledWip, type MetricsProject } from '@/lib/finance/billingMetrics'
import { FIXED_PROJECT_SELECT, TIME_ENTRY_SELECT } from '@/lib/finance/dashboardData'
import { entriesToMetrics } from '@/lib/finance/timeEntries'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { BillingWorkflowNav, type BillingStep } from '@/components/finance/BillingWorkflowNav'
import { db } from '@/lib/finance/db'
import { FinanceOutletProvider } from '@/components/finance/finance-outlet'
import { useTranslations } from 'next-intl'

function stepFromPath(pathname: string): BillingStep | undefined {
  if (pathname.endsWith('/pipeline')) return 'pipeline'
  if (pathname.endsWith('/time')) return 'time'
  if (pathname.endsWith('/invoices')) return 'invoices'
  if (pathname.endsWith('/projects')) return 'projects'
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

export function BillingPage({ children }: { children?: ReactNode }) {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const current = stepFromPath(pathname)
  const [metrics, setMetrics] = useState({ unbilledHours: 0, unbilledAmount: 0, fixedWip: 0, draftInvoices: 0 })

  useEffect(() => {
    loadMetrics()
  }, [pathname])

  async function loadMetrics() {
    const [{ data: entries }, { data: fixedProjects }, { data: drafts }] = await Promise.all([
      db.from('time_entries').select(TIME_ENTRY_SELECT),
      db.from('projects').select(FIXED_PROJECT_SELECT),
      db.from('invoices').select('id').eq('status', 'draft'),
    ])

    const wip = computeUnbilledWip(entriesToMetrics(entries ?? []), (fixedProjects ?? []) as MetricsProject[])

    setMetrics({
      unbilledHours: wip.hours,
      unbilledAmount: wip.amount,
      fixedWip: wip.fixedAmount,
      draftInvoices: drafts?.length ?? 0,
    })
  }

  return (
    <PageShell width="wide" className="space-y-4">
      <PageHeader
        title={t('billing.title')}
        subtitle={
          <>
            {t('billing.subtitlePrefix')}{' '}
            <Link href="/partners" className="text-brand hover:underline">
              {t('billing.clientPartnersLink')}
            </Link>{' '}
            {t('billing.subtitleSuffix')}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <MetricChip label={t('billing.unbilled')} value={`${metrics.unbilledHours} h`} />
        <MetricChip label={t('billing.hourly')} value={formatCad(metrics.unbilledAmount - metrics.fixedWip)} />
        <MetricChip label={t('billing.fixedFees')} value={formatCad(metrics.fixedWip)} />
        <MetricChip label={t('billing.drafts')} value={metrics.draftInvoices} />
      </div>

      <BillingWorkflowNav current={current} />

      <FinanceOutletProvider value={{ refreshMetrics: loadMetrics }}>{children}</FinanceOutletProvider>
    </PageShell>
  )
}
