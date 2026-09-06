'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { monthEndForDate, formatPeriodLabel, dateOnly } from '@/lib/finance/fiscalPeriodClose'
import { usePeriodCloseGuard } from '@/components/finance/contexts/PeriodCloseContext'
import { computeUnbilledWipAsOf } from '@/lib/finance/wipAccrual'
import { TIME_ENTRY_SELECT } from '@/lib/finance/dashboardData'
import { entriesToMetrics } from '@/lib/finance/timeEntries'
import type { MetricsProject } from '@/lib/finance/billingMetrics'
import { formatCad } from '@/lib/finance/format'
import { Button } from '@/components/finance/Button'
import { Field, inputClass } from '@/components/finance/Field'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { EmptyState } from '@/components/finance/EmptyState'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function PeriodClosePage() {
  const t = useTranslations('financeApp')
  const { closes, loading, reload } = usePeriodCloseGuard()
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()))
  const [notes, setNotes] = useState('')
  const [wipEnabled, setWipEnabled] = useState(false)
  const [wipAmount, setWipAmount] = useState(0)
  const [wipHours, setWipHours] = useState(0)
  const [wipLoading, setWipLoading] = useState(false)

  const closedSet = useMemo(() => new Set(closes.map((c) => dateOnly(c.period_end))), [closes])
  const targetEnd = monthEndForDate(`${selectedMonth}-15`)

  useEffect(() => {
    void loadWipPreview(targetEnd)
  }, [targetEnd])

  async function loadWipPreview(periodEnd: string) {
    setWipLoading(true)
    const [settingsRow, invoices, timeEntries, fixedProjects] = await Promise.all([
      db.from('organization_settings').select('wip_accrual_enabled').maybeSingle(),
      db.from('invoices').select('id, invoice_date'),
      db.from('time_entries').select(TIME_ENTRY_SELECT),
      db
        .from('projects')
        .select('id, partner_id, billing_type, fixed_price, invoice_id, status, default_hourly_rate')
        .eq('billing_type', 'fixed'),
    ])

    const enabled = Boolean(settingsRow.data?.wip_accrual_enabled)
    setWipEnabled(enabled)
    if (!enabled) {
      setWipAmount(0)
      setWipHours(0)
      setWipLoading(false)
      return
    }

    const invoiceDates = new Map((invoices.data ?? []).map((inv) => [inv.id, inv.invoice_date]))
    const wip = computeUnbilledWipAsOf(
      entriesToMetrics(timeEntries.data ?? []),
      (fixedProjects.data ?? []) as MetricsProject[],
      periodEnd,
      invoiceDates
    )
    setWipAmount(wip.amount)
    setWipHours(wip.hours)
    setWipLoading(false)
  }

  async function closePeriod() {
    const periodEnd = targetEnd
    if (closedSet.has(periodEnd)) {
      alert(t('periodClose.alreadyClosedAlert'))
      return
    }
    const { error: insertErr } = await db.from('fiscal_period_closes').insert({
      period_end: periodEnd,
      notes: notes.trim() || null,
    })
    if (insertErr) {
      alert(
        insertErr.message.includes('fiscal_period_closes')
          ? t('periodClose.missingTable')
          : insertErr.message
      )
      return
    }
    setNotes('')
    await reload()
  }

  async function reopen(periodEnd: string) {
    if (!confirm(t('periodClose.confirmReopen', { period: formatPeriodLabel(periodEnd) }))) return
    const { error } = await db.from('fiscal_period_closes').delete().eq('period_end', periodEnd)
    if (error) {
      alert(error.message)
      return
    }
    await reload()
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={t('periodClose.title')}
        subtitle={t('periodClose.subtitle')}
      />

      <div className="card p-4 space-y-4 mb-6">
        <Field label={t('periodClose.monthToClose')}>
          <input
            type="month"
            className={inputClass}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </Field>
        <Field label={t('periodClose.notes')}>
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="text-sm text-muted-foreground">
          {t('periodClose.periodEnd')} <strong>{targetEnd}</strong>
          {closedSet.has(targetEnd) ? t('periodClose.alreadyClosed') : ''}
        </p>

        <div className="rounded-lg border border-border bg-muted p-3 text-sm space-y-1">
          <p className="font-medium text-foreground">{t('periodClose.unbilledWip')}</p>
          {wipLoading ? (
            <p className="text-muted-foreground">{t('common.calculating')}</p>
          ) : wipEnabled ? (
            <>
              <p>
                {t('periodClose.wipAt', { period: formatPeriodLabel(targetEnd), amount: formatCad(wipAmount) })}
                {wipHours > 0 ? t('periodClose.hourlyHours', { hours: wipHours }) : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('periodClose.wipNote')}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              {t('periodClose.wipOff')}{' '}
              <Link href="/settings/organization#company" className="text-brand hover:underline">
                {t('periodClose.enableInSettings')}
              </Link>
              .
            </p>
          )}
        </div>

        <Button type="button" onClick={closePeriod} disabled={closedSet.has(targetEnd)}>
          {t('periodClose.closeMonth', { period: formatPeriodLabel(targetEnd) })}
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : closes.length === 0 ? (
        <EmptyState message={t('periodClose.empty')} />
      ) : (
        <ul className="space-y-2">
          {closes.map((c) => (
            <li key={c.id} className="card p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{formatPeriodLabel(c.period_end)}</p>
                <p className="text-sm text-muted-foreground">
                  {t('periodClose.closedOn', { date: new Date(c.closed_at).toLocaleDateString('fr-CA') })}
                  {c.notes ? ` · ${c.notes}` : ''}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => reopen(c.period_end)}>
                {t('periodClose.reopen')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
