'use client'

import type { ReactNode } from 'react'

import {
  ListTableCard,
  listTableScrollClassName,
} from '@/components/layout/list-layout'
import { cn } from '@/lib/utils'

export function DataTable({
  children,
  minWidth = 720,
  className = '',
}: {
  children: ReactNode
  minWidth?: number
  className?: string
}) {
  return (
    <ListTableCard className={className}>
      <div className={cn('overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]', listTableScrollClassName)}>
        <table className="w-full text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </ListTableCard>
  )
}
