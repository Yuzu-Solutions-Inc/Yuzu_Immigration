'use client'

import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarRange,
  FileBarChart,
  Lock,
  Percent,
  Receipt,
  Scale,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { HubCard, HubSection } from '@/components/finance/HubCard'

export function OtherHubPage() {
  const t = useTranslations('financeApp')
  return (
    <PageShell width="narrow">
      <PageHeader title={t('other.title')} subtitle={t('other.subtitle')} />

      <div className="space-y-5">
        <HubSection title={t('other.tax')}>
          <HubCard
            to="/sales-tax"
            icon={Percent}
            title={t('other.salesTax')}
            description={t('other.salesTaxDesc')}
            badge={t('other.quarterly')}
          />
          <HubCard
            to="/corporate-tax"
            icon={Scale}
            title={t('other.corpTax')}
            description={t('other.corpTaxDesc')}
            badge={t('other.annual')}
          />
          <HubCard
            to="/tax-exports"
            icon={CalendarRange}
            title={t('other.taxCalendars')}
            description={t('other.taxCalendarsDesc')}
          />
          <HubCard
            to="/compliance"
            icon={CalendarClock}
            title={t('other.compliance')}
            description={t('other.complianceDesc')}
            badge={t('other.calendar')}
          />
        </HubSection>

        <HubSection title={t('other.accounting')}>
          <HubCard
            to="/financial-reports"
            icon={FileBarChart}
            title={t('other.reports')}
            description={t('other.reportsDesc')}
          />
          <HubCard
            to="/period-close"
            icon={Lock}
            title={t('other.periodClose')}
            description={t('other.periodCloseDesc')}
          />
          <HubCard
            to="/ledger"
            icon={BookOpen}
            title={t('other.ledger')}
            description={t('other.ledgerDesc')}
          />
          <HubCard
            to="/adjustments"
            icon={SlidersHorizontal}
            title={t('other.adjustments')}
            description={t('other.adjustmentsDesc')}
          />
        </HubSection>

        <HubSection title={t('other.tools')}>
          <HubCard
            to="/employee-expenses"
            icon={Receipt}
            title={t('employeeExpenses.title')}
            description={t('employeeExpenses.subtitle')}
          />
          <HubCard
            to="/backup"
            icon={Archive}
            title={t('other.backup')}
            description={t('other.backupDesc')}
          />
        </HubSection>
      </div>
    </PageShell>
  )
}
