'use client'

import { listMobileEmptyClassName } from '@/components/layout/list-layout'

export function EmptyState({ message }: { message: string }) {
  return <div className={listMobileEmptyClassName}>{message}</div>
}
