import type { PayFrequency } from './types'
import { addDays } from './format'
import { round2 } from './taxes'
import { normalizeCaRegion } from '../sage/tax-regions'
import {
  calculatePayPeriod,
  EMPTY_PAYROLL_YTD,
  loadPayrollRates,
  PAYROLL_RATES_YEAR as ENGINE_YEAR,
  periodsPerYear as enginePeriods,
  type CaProvinceCode,
  type PayrollYtd,
} from './payroll'

/**
 * Québec / Canadian payroll — CRA T4127 Option 1 and Revenu Québec TP-1015.F-V.
 * Annual constants live in `payroll/rates/*.json` (no hardcoded Jan-1 rate edits).
 */
export const PAYROLL_RATES_YEAR = ENGINE_YEAR

export function periodsPerYear(freq: PayFrequency): number {
  return enginePeriods(freq)
}

export function payFrequencyLabel(freq: PayFrequency): string {
  switch (freq) {
    case 'weekly':
      return 'Hebdomadaire'
    case 'biweekly':
      return 'Aux 2 semaines'
    case 'semimonthly':
      return 'Bi-mensuel'
    case 'monthly':
      return 'Mensuel'
  }
}

export function grossPerPeriod(yearlySalary: number, freq: PayFrequency): number {
  return round2(yearlySalary / periodsPerYear(freq))
}

export function payPeriodRange(paymentDate: string, freq: PayFrequency): { start: string; end: string } {
  const spanDays = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }[freq]
  return { end: paymentDate, start: addDays(paymentDate, -(spanDays - 1)) }
}

export interface PayrollDeductions {
  gross_pay: number
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  net_pay: number
  qpp2_employee: number
  qpp2_employer: number
  cnt_employer: number
  engine_year: number
  t4_boxes: Record<string, number>
  rl1_boxes: Record<string, number>
}

export function employmentProvince(
  emp: { province_of_employment?: string | null } | string | null | undefined
): CaProvinceCode {
  const raw = typeof emp === 'object' && emp ? emp.province_of_employment : emp
  return normalizeCaRegion(raw) ?? 'QC'
}

export function calculatePayrollDeductions(params: {
  yearlySalary: number
  payFrequency: PayFrequency
  estimatedYearlyIncome?: number | null
  /** Extra pensionable / taxable amount this period only (e.g. taxable reimbursement HT). */
  extraTaxableThisPeriod?: number
  /** @deprecated Use extraTaxableThisPeriod — annualizing one-time amounts overstates withholdings. */
  extraTaxableAnnual?: number
  /** EI Act s. 5(2)(b): more than 40% of voting shares — not insurable. */
  eiExempt?: boolean
  provinceOfEmployment?: CaProvinceCode | string | null
  td1FederalClaim?: number | null
  td1ProvincialClaim?: number | null
  paymentDate?: string
  ytd?: PayrollYtd
  rrspThisPeriod?: number
}): PayrollDeductions {
  const { yearlySalary, payFrequency } = params
  const periods = periodsPerYear(payFrequency)
  const extraFromAnnual =
    params.extraTaxableThisPeriod == null && params.extraTaxableAnnual
      ? Number(params.extraTaxableAnnual) / periods
      : 0
  const extra = Math.max(0, Number(params.extraTaxableThisPeriod ?? extraFromAnnual ?? 0))
  const salaryGross = grossPerPeriod(yearlySalary, payFrequency)
  const province = employmentProvince(params.provinceOfEmployment)
  const result = calculatePayPeriod({
    paymentDate: params.paymentDate ?? `${PAYROLL_RATES_YEAR}-06-15`,
    payFrequency,
    grossPay: salaryGross,
    bonus: extra,
    rrspThisPeriod: Number(params.rrspThisPeriod ?? 0),
    unionDuesThisPeriod: 0,
    additionalTaxRequested: 0,
    additionalQuebecTaxRequested: 0,
    provinceOfEmployment: province,
    td1FederalClaim: params.td1FederalClaim ?? null,
    td1ProvincialClaim: params.td1ProvincialClaim ?? null,
    projectedAnnualIncome: params.estimatedYearlyIncome ?? null,
    pensionableMonths: 12,
    cppQppExempt: false,
    eiExempt: Boolean(params.eiExempt),
    qpipExempt: false,
    ytd: params.ytd ?? { ...EMPTY_PAYROLL_YTD },
    employer: {
      totalPayroll: yearlySalary,
      hsfSector: 'other',
      hsfRateOverride: null,
      cnesstRate: 0,
    },
  })
  const pensionEmployee = province === 'QC' ? result.qpp.employeeCombined : result.cpp.employeeCombined
  const pensionEmployer = province === 'QC' ? result.qpp.employerCombined : result.cpp.employerCombined
  const qpp2Employee = province === 'QC' ? result.qpp.employeeSecond : result.cpp.employeeSecond
  const qpp2Employer = province === 'QC' ? result.qpp.employerSecond : result.cpp.employerSecond
  return {
    gross_pay: result.grossPay,
    federal_tax: result.federalTax,
    provincial_tax: result.provincialTax,
    cpp_employee: pensionEmployee,
    ei_employee: result.ei.employee,
    qpip_employee: result.qpip.employee,
    cpp_employer: pensionEmployer,
    ei_employer: result.ei.employer,
    qpip_employer: result.qpip.employer,
    net_pay: result.netPay,
    qpp2_employee: qpp2Employee,
    qpp2_employer: qpp2Employer,
    cnt_employer: result.levies.cnt,
    engine_year: result.year,
    t4_boxes: result.t4,
    rl1_boxes: result.rl1,
  }
}

export function splitDividendEqually(totalAmount: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor((totalAmount / count) * 100) / 100
  const amounts = Array(count).fill(base)
  const remainder = round2(totalAmount - base * count)
  if (remainder > 0) amounts[0] = round2(amounts[0] + remainder)
  return amounts
}

export function splitDividendByShares(
  totalAmount: number,
  shareholders: { shares_held: number }[]
): number[] {
  if (shareholders.length === 0) return []
  const totalShares = shareholders.reduce((s, sh) => s + Number(sh.shares_held), 0)
  if (totalShares <= 0) return splitDividendEqually(totalAmount, shareholders.length)

  const amounts = shareholders.map((sh) =>
    round2(Math.floor((totalAmount * (Number(sh.shares_held) / totalShares)) * 100) / 100)
  )
  const assigned = round2(amounts.reduce((s, a) => s + a, 0))
  const remainder = round2(totalAmount - assigned)
  if (remainder > 0) amounts[0] = round2(amounts[0] + remainder)
  return amounts
}

export function employeeDisplayName(e: { first_name: string; last_name: string }): string {
  return `${e.first_name} ${e.last_name}`.trim()
}

/** Threshold is strictly more than 40% of voting shares (exactly 40% remains insurable). */
export const EI_VOTING_CONTROL_THRESHOLD = 0.4

export function votingShareRatio(
  employeeId: string,
  shareholders: { employee_id: string | null; shares_held: number; active: boolean }[]
): number | null {
  const active = shareholders.filter((s) => s.active)
  const total = active.reduce((s, sh) => s + Number(sh.shares_held), 0)
  if (total <= 0) return null
  const held = active
    .filter((s) => s.employee_id === employeeId)
    .reduce((s, sh) => s + Number(sh.shares_held), 0)
  return held / total
}

/** EI exemption: employee flag and/or cap table (shares_held used as voting proxy). */
export function isEiExemptOver40Voting(params: {
  over_40_percent_voting?: boolean | null
  employeeId?: string | null
  shareholders?: { employee_id: string | null; shares_held: number; active: boolean }[]
}): boolean {
  if (params.over_40_percent_voting) return true
  if (!params.employeeId || !params.shareholders) return false
  const ratio = votingShareRatio(params.employeeId, params.shareholders)
  return ratio != null && ratio > EI_VOTING_CONTROL_THRESHOLD
}

export const EMPLOYEE_DEDUCTION_FIELDS = [
  { key: 'federal_tax' as const, label: 'Impôt fédéral (retenue)' },
  { key: 'provincial_tax' as const, label: 'Impôt provincial (retenue)' },
  { key: 'cpp_employee' as const, label: 'RRQ / QPP — part employé' },
  { key: 'ei_employee' as const, label: 'AE Québec — part employé' },
  { key: 'qpip_employee' as const, label: 'RQAP — part employé' },
  { key: 'other_deductions' as const, label: 'Autres déductions' },
]

export const EMPLOYER_CONTRIBUTION_FIELDS = [
  { key: 'cpp_employer' as const, label: 'RRQ / QPP — part employeur' },
  { key: 'ei_employer' as const, label: 'AE Québec — part employeur' },
  { key: 'qpip_employer' as const, label: 'RQAP — part employeur' },
  { key: 'employer_benefits' as const, label: 'Avantages employeur' },
]

export function sumEmployeeDeductions(f: {
  federal_tax: number
  provincial_tax: number
  cpp_employee: number
  ei_employee: number
  qpip_employee: number
  other_deductions: number
}): number {
  return (
    f.federal_tax +
    f.provincial_tax +
    f.cpp_employee +
    f.ei_employee +
    f.qpip_employee +
    f.other_deductions
  )
}

export function sumEmployerContributions(f: {
  cpp_employer: number
  ei_employer: number
  qpip_employer: number
  employer_benefits: number
  hsf_employer?: number
  cnesst_employer?: number
  cnt_employer?: number
}): number {
  return (
    f.cpp_employer +
    f.ei_employer +
    f.qpip_employer +
    f.employer_benefits +
    Number(f.hsf_employer ?? 0) +
    Number(f.cnesst_employer ?? 0) +
    Number(f.cnt_employer ?? 0)
  )
}

export function calculateEmployerLevies(
  grossPay: number,
  hsfRate: number,
  cnesstRate: number,
  quebec = true
) {
  const rates = loadPayrollRates()
  return {
    hsf_employer: round2(grossPay * hsfRate),
    cnesst_employer: round2(grossPay * cnesstRate),
    cnt_employer: quebec ? round2(grossPay * rates.cnt.rate) : 0,
  }
}
