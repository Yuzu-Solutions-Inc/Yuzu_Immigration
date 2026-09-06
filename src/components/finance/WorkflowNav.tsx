'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { NavLink } from '@/components/finance/nav-link'

export type WorkflowStepDef = {
  id: string
  to: string
  label: string
  hint: string
}

export type WorkflowTerminalStep = {
  to: string
  label: string
  hint: string
  stepNumber: number
  dashed?: boolean
}

export type WorkflowNavVariant = 'pills' | 'tabs'

function stepClass(isActive: boolean, dashed?: boolean) {
  const base = dashed
    ? 'border-dashed border-border bg-surface hover:border-ring/40 hover:bg-muted'
    : isActive
      ? 'border-ring bg-action/10 shadow-sm'
      : 'border-border bg-surface hover:border-ring/40 hover:bg-muted'
  return `flex-1 min-w-[8.5rem] rounded-lg border px-3 py-2.5 text-left transition-colors ${base}`
}

function StepPill({
  stepNumber,
  label,
  hint,
  active,
  dashed,
  to,
  end,
}: {
  stepNumber: number
  label: string
  hint: string
  active: boolean
  dashed?: boolean
  to: string
  end?: boolean
}) {
  return (
    <NavLink href={to} end={end} className={({ isActive }) => stepClass(isActive || active, dashed)}>
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            active ? 'bg-action text-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {stepNumber}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate max-w-[9rem] sm:max-w-none">{hint}</div>
        </div>
      </div>
    </NavLink>
  )
}

function tabClass(isActive: boolean, dashed?: boolean) {
  const base = 'flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap rounded-lg transition-colors'
  if (dashed) {
    return `${base} text-muted-foreground hover:text-foreground hover:bg-muted`
  }
  return `${base} ${
    isActive
      ? 'bg-action/10 text-foreground font-medium'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
  }`
}

function StepTab({
  stepNumber,
  label,
  active,
  dashed,
  to,
  end,
}: {
  stepNumber: number
  label: string
  active: boolean
  dashed?: boolean
  to: string
  end?: boolean
}) {
  return (
    <NavLink href={to} end={end} className={({ isActive }) => tabClass(isActive || active, dashed)}>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
          active && !dashed ? 'bg-action text-foreground' : 'bg-stone-200/80 text-muted-foreground'
        }`}
      >
        {stepNumber}
      </span>
      {label}
    </NavLink>
  )
}

export function WorkflowNav({
  ariaLabel,
  steps,
  currentId,
  terminalSteps = [],
  asideLink,
  variant = 'pills',
}: {
  ariaLabel: string
  steps: WorkflowStepDef[]
  currentId?: string
  terminalSteps?: WorkflowTerminalStep[]
  asideLink?: { to: string; label: string }
  variant?: WorkflowNavVariant
}) {
  const t = useTranslations('financeApp')
  if (variant === 'tabs') {
    return (
      <nav aria-label={ariaLabel} className="flex items-center gap-2 min-w-0">
        <ol className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-surface p-0.5 snap-x snap-mandatory">
          {steps.map((s, i) => (
            <li key={s.to} className="shrink-0 snap-start">
              <StepTab
                stepNumber={i + 1}
                label={s.label}
                active={currentId === s.id}
                to={s.to}
              />
            </li>
          ))}
          {terminalSteps.map((t) => (
            <li key={t.to} className="shrink-0 snap-start ml-0.5 pl-1 border-l border-border">
              <StepTab
                stepNumber={t.stepNumber}
                label={t.label}
                active={false}
                dashed={t.dashed ?? true}
                to={t.to}
              />
            </li>
          ))}
        </ol>
        {asideLink && (
          <Link
            href={asideLink.to}
            className="shrink-0 text-xs font-medium text-brand hover:underline min-h-[44px] sm:min-h-0 flex items-center"
          >
            {asideLink.label} →
          </Link>
        )}
      </nav>
    )
  }

  return (
    <nav aria-label={ariaLabel} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground hidden sm:block">{t('common.workflowFollowSteps')}</p>
        {asideLink && (
          <Link
            href={asideLink.to}
            className="shrink-0 text-xs font-medium text-brand hover:underline min-h-[44px] sm:min-h-0 flex items-center"
          >
            {asideLink.label} →
          </Link>
        )}
      </div>
      <ol className="ui-workflow-scroll">
        {steps.map((s, i) => (
          <li key={s.to} className="flex items-stretch gap-2 shrink-0 snap-start">
            <StepPill
              stepNumber={i + 1}
              label={s.label}
              hint={s.hint}
              active={currentId === s.id}
              to={s.to}
            />
            {i < steps.length - 1 && (
              <span className="hidden md:flex items-center text-muted-foreground/40 px-0.5" aria-hidden>
                →
              </span>
            )}
          </li>
        ))}
        {terminalSteps.map((t) => (
          <li key={t.to} className="flex items-stretch shrink-0 snap-start">
            <StepPill
              stepNumber={t.stepNumber}
              label={t.label}
              hint={t.hint}
              active={false}
              dashed={t.dashed ?? true}
              to={t.to}
            />
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Compact action row for workflow-embedded steps (no duplicate step title). */
export function StepActionBar({
  actions,
  hint,
}: {
  actions?: ReactNode
  hint?: ReactNode
}) {
  if (!actions && !hint) return null
  return (
    <div className="flex items-center justify-between gap-3 min-h-[2.25rem]">
      {hint ? <p className="text-sm text-muted-foreground truncate min-w-0 hidden sm:block">{hint}</p> : <span />}
      {actions && <div className="flex flex-wrap gap-2 shrink-0 ml-auto">{actions}</div>}
    </div>
  )
}

export function StepPanelHeader({
  step,
  totalSteps,
  title,
  hint,
  actions,
}: {
  step: number
  totalSteps?: number
  title: string
  hint?: ReactNode
  actions?: ReactNode
}) {
  const t = useTranslations('financeApp')
  return (
    <div className="ui-card p-4 mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action text-sm font-semibold text-foreground">
            {step}
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {totalSteps ? t('common.stepOf', { step, total: totalSteps }) : t('common.step', { step })}
            </p>
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {hint && <p className="text-sm text-muted-foreground mt-0.5">{hint}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
