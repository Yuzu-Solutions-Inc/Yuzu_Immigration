'use client'

import { useTranslations } from 'next-intl'
import { WorkflowNav, type WorkflowStepDef, type WorkflowTerminalStep } from './WorkflowNav'

export type BillingStep = 'projects' | 'pipeline' | 'time' | 'invoices'

export function BillingWorkflowNav({ current }: { current?: BillingStep }) {
  const t = useTranslations('financeApp')
  const steps: WorkflowStepDef[] = [
    { id: 'projects', to: '/billing/projects', label: t('billing.stepProjects'), hint: t('billing.stepProjectsHint') },
    { id: 'pipeline', to: '/billing/pipeline', label: t('billing.stepPipeline'), hint: t('billing.stepPipelineHint') },
    { id: 'time', to: '/billing/time', label: t('billing.stepTime'), hint: t('billing.stepTimeHint') },
    { id: 'invoices', to: '/billing/invoices', label: t('billing.stepInvoices'), hint: t('billing.stepInvoicesHint') },
  ]
  const terminal: WorkflowTerminalStep[] = [
    { to: '/bank', label: t('billing.stepCollection'), hint: t('billing.stepCollectionHint'), stepNumber: 5, dashed: true },
  ]
  return (
    <WorkflowNav
      ariaLabel={t('billing.aria')}
      steps={steps}
      currentId={current}
      terminalSteps={terminal}
      variant="tabs"
    />
  )
}
