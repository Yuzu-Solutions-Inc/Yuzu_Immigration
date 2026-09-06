'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import {
  COMPLIANCE_CATEGORY_LABELS,
  daysUntilDue,
  urgencyTone,
} from '@/lib/finance/compliance'
import { formatCad, formatDate } from '@/lib/finance/format'
import type { ComplianceDeadline } from '@/lib/finance/types'

function dueLabel(dueDate: string, t: ReturnType<typeof useTranslations>) {
  const d = daysUntilDue(dueDate)
  if (d < 0) return t('dashboard.overdueDays', { days: Math.abs(d) })
  if (d === 0) return t('dashboard.today')
  if (d === 1) return t('dashboard.tomorrow')
  return t('dashboard.inDays', { days: d })
}

function toneClass(dueDate: string) {
  const t = urgencyTone(dueDate)
  if (t === 'overdue') return 'text-red-700'
  if (t === 'soon') return 'text-amber-800'
  return 'text-muted-foreground'
}

export function UpcomingDeadlinesCard({
  rows,
  loading,
  compact = false,
}: {
  rows: ComplianceDeadline[]
  loading?: boolean
  compact?: boolean
}) {
  const t = useTranslations('financeApp')
  return (
    <div className={`ui-card flex flex-col ${compact ? 'p-3 gap-2' : 'p-4 gap-3'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboard.upcomingDeadlines')}</h2>
          {!compact && <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.upcomingDeadlinesHint')}</p>}
        </div>
        <Link href="/compliance" className="text-xs font-medium text-brand hover:underline shrink-0">
          {t('common.calendarLink')}
        </Link>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t('dashboard.loading')}</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('dashboard.noOpenDeadlines')}{' '}
          <Link href="/compliance" className="font-medium text-brand hover:underline">
            {t('dashboard.generateCalendar')}
          </Link>
        </p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex items-start justify-between gap-3 ${compact ? 'py-1.5 first:pt-0 last:pb-0' : 'py-2.5 first:pt-0 last:pb-0'}`}
            >
              <div className="min-w-0">
                <div className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>{r.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {COMPLIANCE_CATEGORY_LABELS[r.category]} · {formatDate(r.due_date)}
                  {r.amount != null && Number(r.amount) !== 0 ? ` · ${formatCad(Number(r.amount))}` : ''}
                </div>
              </div>
              <span className={`text-[11px] font-medium shrink-0 ${toneClass(r.due_date)}`}>
                {dueLabel(r.due_date, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
