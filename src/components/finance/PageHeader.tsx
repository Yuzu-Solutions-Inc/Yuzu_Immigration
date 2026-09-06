'use client'

import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import {
  listPageHeaderClassName,
  listPageSubtitleClassName,
  listPageTitleClassName,
} from '@/components/layout/list-layout'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  className = '',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  backTo?: { to: string; label: string }
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className={listPageHeaderClassName}>
        {backTo && (
          <Link href={backTo.to} className="inline-flex min-h-[44px] items-center text-sm text-brand hover:underline sm:min-h-0">
            ← {backTo.label}
          </Link>
        )}
        {typeof title === 'string' ? (
          <h1 className={listPageTitleClassName}>{title}</h1>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <p className={listPageSubtitleClassName}>{subtitle}</p>
          ) : (
            <div className={listPageSubtitleClassName}>{subtitle}</div>
          )
        ) : null}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
}

/** Compact section header (e.g. Payments subsections). */
export function SectionHeader({
  title,
  actions,
  className = 'mb-3',
}: {
  title: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      {typeof title === 'string' ? (
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      ) : (
        title
      )}
      {actions}
    </div>
  )
}
