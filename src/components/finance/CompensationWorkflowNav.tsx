'use client'

import { useTranslations } from 'next-intl'
import { WorkflowNav, type WorkflowStepDef } from './WorkflowNav'

export type CompensationStep = 'payroll' | 'dividends'

export function CompensationWorkflowNav({ current }: { current?: CompensationStep }) {
  const t = useTranslations('financeApp')
  const steps: WorkflowStepDef[] = [
    { id: 'payroll', to: '/compensation/payroll', label: t('compensation.stepSalary'), hint: t('compensation.stepSalaryHint') },
    { id: 'dividends', to: '/compensation/dividends', label: t('compensation.stepDividends'), hint: t('compensation.stepDividendsHint') },
  ]
  const asideLinkByStep: Record<CompensationStep, { to: string; label: string }> = {
    payroll: { to: '/compensation/employees', label: t('compensation.employeesLink') },
    dividends: { to: '/compensation/shareholders', label: t('compensation.shareholdersLink') },
  }
  return (
    <WorkflowNav
      ariaLabel={t('compensation.aria')}
      steps={steps}
      currentId={current}
      asideLink={current ? asideLinkByStep[current] : undefined}
      variant="tabs"
    />
  )
}
