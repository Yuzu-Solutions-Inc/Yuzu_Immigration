'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  children,
  resultCount,
  totalCount,
  activeFilterCount = 0,
  onClearFilters,
  clearVisible = false,
  trailing,
  hideSearch = false,
  variant = 'card',
}: {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  resultCount?: number
  totalCount?: number
  activeFilterCount?: number
  onClearFilters?: () => void
  clearVisible?: boolean
  trailing?: ReactNode
  hideSearch?: boolean
  variant?: 'card' | 'plain'
}) {
  const t = useTranslations('financeApp')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasFilterControls = !!children
  const showCount = resultCount != null && totalCount != null
  const plain = variant === 'plain'
  const placeholder = searchPlaceholder ?? t('common.searchPlaceholder')

  return (
    <div
      className={
        plain
          ? 'space-y-2'
          : 'space-y-3 rounded-xl border border-border bg-surface p-3 shadow-elevated sm:p-4'
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {!hideSearch && (
          <div className="w-full flex-1 sm:max-w-sm">
            <Input
              type="search"
              density="dense"
              placeholder={placeholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={t('common.search')}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {hasFilterControls && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sm:hidden"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              {t('common.filters')}
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-action px-1 text-[11px] font-semibold text-action-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
          {clearVisible && onClearFilters && (
            <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
              {t('common.reset')}
            </Button>
          )}
          {trailing}
        </div>
      </div>

      {hasFilterControls && (
        <div
          className={cn(
            filtersOpen ? 'block' : 'hidden',
            'sm:block',
            !plain && 'border-t border-border pt-3 sm:border-0 sm:pt-0',
          )}
        >
          <div
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3"
          >
            {children}
          </div>
        </div>
      )}

      {showCount && (
        <p className={cn('text-xs text-muted-foreground', !plain && 'sm:pt-0')}>
          {resultCount === totalCount
            ? totalCount === 1
              ? t('common.resultsOne', { count: totalCount })
              : t('common.results', { count: totalCount })
            : t('common.ofTotal', { count: resultCount, total: totalCount })}
        </p>
      )}
    </div>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <label className={`flex min-w-0 flex-1 flex-col gap-1 text-sm ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <NativeSelect
        density="dense"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}

export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  const t = useTranslations('financeApp')
  const resolvedLabel = label ?? t('common.display')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{resolvedLabel}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] rounded-lg px-3 py-2 text-sm transition-colors active:scale-[0.98] sm:min-h-[36px] sm:py-1.5 ${
              value === o.value
                ? 'bg-action/10 font-medium text-foreground ring-1 ring-ring/30'
                : 'border border-transparent text-muted-foreground hover:border-border hover:bg-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  label,
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  label?: string
}) {
  const t = useTranslations('financeApp')
  const resolvedLabel = label ?? t('common.period')
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{resolvedLabel}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">{t('common.from')}</span>
          <Input type="date" density="dense" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">{t('common.to')}</span>
          <Input type="date" density="dense" value={to} onChange={(e) => onToChange(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

/** @deprecated Use ListToolbar onClearFilters + clearVisible instead. */
export function ClearFiltersButton({ onClick, visible }: { onClick: () => void; visible: boolean }) {
  const t = useTranslations('financeApp')
  if (!visible) return null
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {t('common.reset')}
    </Button>
  )
}

export function ViewToggle<T extends string>({
  value,
  onChange,
  options,
  label = 'Vue',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  return <FilterChips value={value} onChange={onChange} options={options} label={label} />
}
