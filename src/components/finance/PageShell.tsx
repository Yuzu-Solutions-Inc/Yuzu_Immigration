'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Width = 'full' | 'wide' | 'narrow'

export function PageShell({
  children,
  width = 'full',
  className = '',
}: {
  children: ReactNode
  width?: Width
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 space-y-5',
        width === 'narrow' && 'max-w-2xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
