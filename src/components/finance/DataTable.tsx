'use client'

import type { ReactNode } from 'react'

import {
  ListTableCard,
  listTableScrollClassName,
} from '@/components/layout/list-layout'
import { cn } from '@/lib/utils'

export function DataTable({
  children,
  minWidth,
  className = '',
}: {
  children: ReactNode
  minWidth?: number
  className?: string
}) {
  return (
    <ListTableCard className={className}>
      <div
        className={cn(
          'min-w-0',
          listTableScrollClassName,
          minWidth
            ? 'overflow-x-auto overscroll-x-contain lg:overflow-x-auto [-webkit-overflow-scrolling:touch]'
            : null,
        )}
      >
        <table className="w-full text-sm" style={minWidth ? { minWidth } : undefined}>
          {children}
        </table>
      </div>
    </ListTableCard>
  )
}
