'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Link, usePathname } from '@/i18n/navigation'
import { formatCad } from '@/lib/finance/format'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { BillingWorkflowNav, type BillingStep } from '@/components/finance/BillingWorkflowNav'
import { db } from '@/lib/finance/db'
import {
  fetchBillingMetrics,
  type BillingMetrics,
} from '@/lib/finance/screen-data'
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

export function BillingPage({
  children,
  initialMetrics,
}: {
  children?: ReactNode
  initialMetrics?: BillingMetrics
}) {
  const t = useTranslations('financeApp')
  const pathname = usePathname()
  const current = stepFromPath(pathname)
  const [metrics, setMetrics] = useState<BillingMetrics>(
    initialMetrics ?? { unbilledHours: 0, unbilledAmount: 0, fixedWip: 0, draftInvoices: 0 },
  )

  useEffect(() => {
    if (initialMetrics) return
    void loadMetrics()
  }, [])

  async function loadMetrics() {
    setMetrics(await fetchBillingMetrics(db))
  }

  return (
    <PageShell width="wide" className="w-full min-w-0 space-y-4">
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
