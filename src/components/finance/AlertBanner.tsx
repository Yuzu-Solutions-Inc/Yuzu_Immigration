import type { ReactNode } from 'react'

export function AlertBanner({
  children,
  variant = 'warning',
}: {
  children: ReactNode
  variant?: 'warning' | 'success' | 'info'
}) {
  const styles =
    variant === 'success'
      ? 'border-border bg-action/10 text-foreground'
      : variant === 'info'
        ? 'border-border bg-surface text-foreground'
        : 'border-border bg-muted text-foreground'

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>
}
