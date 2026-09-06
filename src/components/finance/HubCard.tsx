'use client'

import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { AppIcon, ICON_STROKE } from './icons'

export function HubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">{title}</h2>
      <ul className="ui-card divide-y divide-border overflow-hidden">{children}</ul>
    </section>
  )
}

export function HubCard({
  to,
  title,
  description,
  badge,
  icon,
}: {
  to: string
  title: string
  description: string
  badge?: string
  icon?: LucideIcon
}) {
  return (
    <li>
      <Link
        href={to}
        className="flex items-center gap-3 px-3.5 py-2.5 min-h-[52px] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 transition-colors"
      >
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-action/10 text-brand shrink-0">
            <AppIcon icon={icon} size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{title}</span>
            {badge && (
              <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={ICON_STROKE.nav}
          className="text-muted-foreground shrink-0 opacity-60"
          aria-hidden
        />
      </Link>
    </li>
  )
}
