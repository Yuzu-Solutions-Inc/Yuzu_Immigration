'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { inputClass } from './Field'

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
          ? 'mb-3 space-y-2'
          : 'ui-card p-3 sm:p-4 mb-4 space-y-3'
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        {!hideSearch && (
          <div className="relative flex-1 w-full sm:max-w-sm">
            <input
              type="search"
              className={`${inputClass} pl-9`}
              placeholder={placeholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={t('common.search')}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none" aria-hidden>
              ⌕
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
          {hasFilterControls && (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="sm:hidden min-h-[44px] px-3 rounded-lg border border-border bg-surface text-sm font-medium flex items-center gap-2"
              aria-expanded={filtersOpen}
            >
              {t('common.filters')}
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-action text-[11px] font-semibold text-foreground px-1">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {clearVisible && onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg border border-border bg-muted text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {t('common.reset')}
            </button>
          )}
          {trailing}
        </div>
      </div>

      {hasFilterControls && (
        <div
          className={`${
            filtersOpen ? 'block' : 'hidden'
          } sm:block ${plain ? '' : 'pt-1 sm:pt-0 border-t sm:border-t-0 border-border sm:border-0'}`}
        >
          <div
            className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end ${
              plain ? 'sm:pt-0' : 'pt-3 sm:pt-0 gap-3'
            }`}
          >
            {children}
          </div>
        </div>
      )}

      {showCount && (
        <p className={`text-xs text-muted-foreground ${plain ? '' : 'pt-0.5 border-t border-border sm:border-0'}`}>
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
    <label className={`flex flex-col gap-1 text-sm min-w-[9rem] ${className}`}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <select className="ui-filter-input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <span className="text-muted-foreground text-xs font-medium">{resolvedLabel}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] sm:min-h-[36px] px-3 py-2 sm:py-1.5 rounded-lg text-sm transition-colors active:scale-[0.98] ${
              value === o.value ? 'bg-action/10 font-medium text-foreground ring-1 ring-yuzu/30' : 'text-muted-foreground hover:bg-muted border border-transparent hover:border-border'
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
    <div className="flex flex-col gap-1 min-w-[14rem]">
      <span className="text-muted-foreground text-xs font-medium">{resolvedLabel}</span>
      <div className="flex flex-wrap items-center gap-2 ui-card px-2 py-1.5">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">{t('common.from')}</span>
          <input type="date" className="ui-filter-input py-1.5" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">{t('common.to')}</span>
          <input type="date" className="ui-filter-input py-1.5" value={to} onChange={(e) => onToChange(e.target.value)} />
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
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg border border-border bg-muted text-sm text-muted-foreground hover:text-foreground"
    >
      {t('common.reset')}
    </button>
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
