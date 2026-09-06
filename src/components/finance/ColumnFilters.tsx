'use client'

import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { listTableHeadClassName } from '@/components/layout/list-layout'
import { cn } from '@/lib/utils'

export function FilterTh({
  label,
  children,
  className = '',
}: {
  label: string
  children?: ReactNode
  className?: string
}) {
  return (
    <th className={cn(listTableHeadClassName, 'px-3 text-left font-medium', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
        {children}
      </div>
    </th>
  )
}

export function PlainTh({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        listTableHeadClassName,
        'px-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function HeaderSearch({
  value,
  onChange,
  placeholder = 'Filtrer…',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  'aria-label'?: string
}) {
  return (
    <Input
      type="search"
      density="dense"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
    />
  )
}

export function HeaderSelect({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  'aria-label'?: string
}) {
  return (
    <NativeSelect
      density="dense"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <option key={o.value || '__all'} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  )
}

export function HeaderDateRange({
  from,
  to,
  onFromChange,
  onToChange,
  'aria-label': ariaLabel = 'Période',
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  'aria-label'?: string
}) {
  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1" aria-label={ariaLabel}>
      <Input
        type="date"
        density="dense"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label="Du"
      />
      <Input
        type="date"
        density="dense"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        aria-label="Au"
      />
    </div>
  )
}

/** Compact count + clear row above a column-filtered table. */
export function FilterSummary({
  resultCount,
  totalCount,
  hasFilters,
  onClear,
  actions,
}: {
  resultCount: number
  totalCount: number
  hasFilters: boolean
  onClear: () => void
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-[2.25rem] items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {resultCount === totalCount
          ? `${totalCount} résultat${totalCount !== 1 ? 's' : ''}`
          : `${resultCount} sur ${totalCount}`}
        {hasFilters && (
          <>
            {' · '}
            <button type="button" onClick={onClear} className="font-medium text-brand hover:underline">
              Réinitialiser
            </button>
          </>
        )}
      </p>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
