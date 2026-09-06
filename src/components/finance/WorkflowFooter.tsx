'use client'

import type { ReactNode } from 'react'
import { Link } from '@/i18n/navigation'

export function WorkflowFooter({ children, to, label }: { children?: ReactNode; to: string; label: string }) {
  return (
    <p className="text-sm text-muted-foreground mt-6 pt-4 border-t border-border">
      {children}{' '}
      <Link href={to} className="text-brand font-medium hover:underline">
        {label} →
      </Link>
    </p>
  )
}
