'use client'

import { useEffect, useState } from 'react'
import { fetchGeneralLedgerData, fetchFinancialReportExtras } from '@/lib/finance/glDataLoader'
import { buildFinancialSnapshot } from '@/lib/finance/financials'
import {
  buildCo17Schedule,
  buildT4Rl1Schedule,
  buildT5Schedule,
  downloadScheduleCsv,
} from '@/lib/finance/taxYearExports'
import type { Dividend, Employee, OrganizationSettings, PayrollRun, Shareholder } from '@/lib/finance/types'
import { DEFAULT_ESTIMATED_CORP_TAX_RATE } from '@/lib/finance/organizationSettings'
import { Button } from '@/components/finance/Button'
import { Field, inputClass } from '@/components/finance/Field'
import { PageHeader } from '@/components/finance/PageHeader'
import { PageShell } from '@/components/finance/PageShell'
import { AlertBanner } from '@/components/finance/AlertBanner'
import { db } from '@/lib/finance/db'
import { useTranslations } from 'next-intl'

export function TaxExportsPage() {
  const t = useTranslations('financeApp')
  const [year, setYear] = useState(new Date().getFullYear())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payroll, setPayroll] = useState<PayrollRun[]>([])
  const [shareholders, setShareholders] = useState<Shareholder[]>([])
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [allocations, setAllocations] = useState<{ shareholder_id: string; dividend_id: string; amount: number }[]>([])
  const [co17Ready, setCo17Ready] = useState(false)
  const [co17Input, setCo17Input] = useState<ReturnType<typeof buildCo17Schedule> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [year])

  async function load() {
    setError(null)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const [empRes, payRes, shRes, divRes, allocRes] = await Promise.all([
      db.from('employees').select('*').eq('active', true),
      db.from('payroll_runs').select('*').gte('payment_date', yearStart).lte('payment_date', yearEnd),
      db.from('shareholders').select('*').eq('active', true),
      db.from('dividends').select('*').gte('declared_date', yearStart).lte('declared_date', yearEnd),
      db.from('dividend_allocations').select('shareholder_id, dividend_id, amount'),
    ])

    setEmployees((empRes.data as Employee[]) ?? [])
    setPayroll((payRes.data as PayrollRun[]) ?? [])
    setShareholders((shRes.data as Shareholder[]) ?? [])
    setDividends((divRes.data as Dividend[]) ?? [])
    setAllocations(allocRes.data ?? [])

    if (shRes.error?.message.includes('shareholders')) {
      setError(t('taxExports.missingShareholders'))
    }

    try {
      const { data: glData } = await fetchGeneralLedgerData()
      const extras = await fetchFinancialReportExtras()
      const fin = buildFinancialSnapshot(
        {
          ...glData,
          bankTransactions: extras.bankTransactions,
          payrollRuns: (payRes.data ?? []) as PayrollRun[],
        },
        { start: yearStart, end: yearEnd, label: String(year) },
      )
      const settingsRow = glData.settings as OrganizationSettings | null | undefined
      setCo17Input(
        buildCo17Schedule({
          year,
          revenueSubtotal: fin.income.revenueSubtotal,
          interestIncome: fin.income.interestIncome,
          operatingExpenses: fin.income.operatingExpenses,
          payrollGross: fin.income.payrollGross,
          employerPayrollContributions: fin.income.employerPayrollContributions,
          operatingIncome: fin.income.operatingIncome,
          corpTaxProvision: fin.balanceSheet.corpTaxProvision,
          corpTaxPaid: fin.cashFlow.corporateTaxPaid,
          estimatedRate: Number(settingsRow?.estimated_corp_tax_rate ?? DEFAULT_ESTIMATED_CORP_TAX_RATE),
        })
      )
      setCo17Ready(true)
    } catch {
      setCo17Ready(false)
    }
  }

  function exportT4Rl1() {
    downloadScheduleCsv(`t4-rl1-${year}-draft.csv`, buildT4Rl1Schedule(year, employees, payroll))
  }

  function exportT5() {
    downloadScheduleCsv(`t5-${year}-draft.csv`, buildT5Schedule(year, shareholders, dividends, allocations))
  }

  function exportCo17() {
    if (!co17Input) return
    downloadScheduleCsv(`co17-schedule-${year}-draft.csv`, co17Input)
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title={t('taxExports.title')}
        subtitle={t('taxExports.subtitle')}
      />

      {error && <AlertBanner variant="warning">{error}</AlertBanner>}

      <div className="card p-4 mb-6">
        <Field label={t('taxExports.taxYear')}>
          <input
            type="number"
            className={inputClass}
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">{t('taxExports.t4')}</h2>
          <p className="text-sm text-muted-foreground">
            {payroll.length === 1
              ? t('taxExports.t4Hint', { count: payroll.length })
              : t('taxExports.t4HintPlural', { count: payroll.length })}
          </p>
          <Button type="button" onClick={exportT4Rl1}>
            {t('taxExports.downloadCsv')}
          </Button>
        </div>

        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">{t('taxExports.t5')}</h2>
          <p className="text-sm text-muted-foreground">
            {dividends.length === 1
              ? t('taxExports.t5Hint', { count: dividends.length })
              : t('taxExports.t5HintPlural', { count: dividends.length })}
          </p>
          <Button type="button" onClick={exportT5} disabled={shareholders.length === 0}>
            {t('taxExports.downloadCsv')}
          </Button>
        </div>

        <div className="card p-4 space-y-3 sm:col-span-2">
          <h2 className="font-semibold">{t('taxExports.co17')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('taxExports.co17Hint', { year })}
          </p>
          <Button type="button" onClick={exportCo17} disabled={!co17Ready}>
            {t('taxExports.downloadCsv')}
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
